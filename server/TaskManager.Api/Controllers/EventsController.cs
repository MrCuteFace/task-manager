using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.Api.Auth;
using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Services;

namespace TaskManager.Api.Controllers;

/// <summary>
/// The live channel: one long-lived server-sent-events stream per open tab, carrying the board events
/// the current user is allowed to see.
/// </summary>
[ApiController]
[Route("api")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
public sealed class EventsController(IBoardEventBroker events, ICurrentUser currentUser) : ControllerBase
{
    /// <summary>Anything longer than a proxy's idle timeout and the stream dies silently.</summary>
    private static readonly TimeSpan KeepAliveInterval = TimeSpan.FromSeconds(20);

    private static readonly JsonSerializerOptions EventJson = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    /// <summary>
    /// Streams board events as <c>text/event-stream</c> until the client disconnects. The session token
    /// travels in the usual Authorization header, so the client reads this with fetch rather than
    /// <c>EventSource</c>, which cannot set headers - a token in the query string would end up in logs.
    /// </summary>
    [HttpGet("events")]
    [Produces("text/event-stream")]
    public async Task Stream(CancellationToken cancellationToken)
    {
        var response = Response;
        response.Headers.ContentType = "text/event-stream";
        response.Headers.CacheControl = "no-cache, no-transform";
        // Tells nginx and friends not to buffer; without it the first event can sit for seconds.
        response.Headers["X-Accel-Buffering"] = "no";

        // An opening comment flushes the headers, so the client's fetch resolves at once instead of
        // waiting for whatever happens to be the first real event.
        await WriteAsync(": connected\n\n", cancellationToken);

        using var keepAlive = new PeriodicTimer(KeepAliveInterval);
        var keepAliveLoop = SendKeepAlivesAsync(keepAlive, cancellationToken);

        try
        {
            await foreach (var e in events.Subscribe(currentUser.UserId, cancellationToken))
            {
                var json = JsonSerializer.Serialize(e, EventJson);
                await WriteAsync($"event: {e.Type}\ndata: {json}\n\n", cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
            // The tab closed or navigated away. Normal.
        }
        finally
        {
            keepAlive.Dispose();
            try
            {
                await keepAliveLoop;
            }
            catch (OperationCanceledException)
            {
                // Same close, seen from the other loop.
            }
        }
    }

    private async Task SendKeepAlivesAsync(PeriodicTimer timer, CancellationToken cancellationToken)
    {
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken))
                await WriteAsync(": keep-alive\n\n", cancellationToken);
        }
        catch (OperationCanceledException)
        {
        }
        catch (ObjectDisposedException)
        {
            // The stream ended first and disposed the timer.
        }
    }

    /// <summary>
    /// The keep-alive timer and the event loop both write to the one body, and two interleaved writes
    /// would split an event's frame in half, so every write takes this gate.
    /// </summary>
    private readonly SemaphoreSlim _writeGate = new(1, 1);

    private async Task WriteAsync(string payload, CancellationToken cancellationToken)
    {
        await _writeGate.WaitAsync(cancellationToken);
        try
        {
            await Response.Body.WriteAsync(Encoding.UTF8.GetBytes(payload), cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }
        finally
        {
            _writeGate.Release();
        }
    }
}
