using System.Collections.Concurrent;
using System.Threading.Channels;
using TaskManager.Api.Models.Dtos;

namespace TaskManager.Api.Services;

/// <summary>
/// Live fan-out of board events to connected clients (tech doc §4.2: demo state lives in memory).
/// </summary>
/// <remarks>
/// The visibility model is the product, so it holds here too: an event is published with the id of the
/// user who owns the board it happened on, and every subscriber is tested against
/// <see cref="IVisibilityService.CanSee"/> before the event is handed to them. A manager's comment can
/// therefore never reach a parallel manager's open tab, exactly as it can never reach their board list.
/// </remarks>
public interface IBoardEventBroker
{
    /// <summary>
    /// The events this user may see, until <paramref name="cancellationToken"/> fires. Each subscriber
    /// gets its own buffer; a client that stops reading loses its oldest events rather than stalling
    /// the publisher.
    /// </summary>
    IAsyncEnumerable<BoardEventDto> Subscribe(string userId, CancellationToken cancellationToken);

    /// <summary>Fans one event out to every subscriber the org tree allows to see that board.</summary>
    void Publish(string boardOwnerUserId, BoardEventDto e);

    /// <summary>How many clients are listening. Exposed for tests and diagnostics.</summary>
    int SubscriberCount { get; }
}

public sealed class BoardEventBroker(IVisibilityService visibility) : IBoardEventBroker
{
    /// <summary>
    /// Deep enough that a burst of comments survives a slow tab, small enough that a dead one cannot
    /// grow without bound. Dropping the oldest is right for a live feed: the client refetches anyway.
    /// </summary>
    private const int BufferedEventsPerSubscriber = 32;

    private readonly ConcurrentDictionary<Guid, Subscriber> _subscribers = new();

    public int SubscriberCount => _subscribers.Count;

    public async IAsyncEnumerable<BoardEventDto> Subscribe(
        string userId,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var id = Guid.NewGuid();
        var channel = Channel.CreateBounded<BoardEventDto>(new BoundedChannelOptions(BufferedEventsPerSubscriber)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
        });
        _subscribers[id] = new Subscriber(userId, channel.Writer);

        try
        {
            await foreach (var e in channel.Reader.ReadAllAsync(cancellationToken))
                yield return e;
        }
        finally
        {
            _subscribers.TryRemove(id, out _);
        }
    }

    public void Publish(string boardOwnerUserId, BoardEventDto e)
    {
        foreach (var subscriber in _subscribers.Values)
        {
            if (!visibility.CanSee(subscriber.UserId, boardOwnerUserId)) continue;
            // DropOldest never blocks and never fails, so the publisher is not held up by a slow client.
            subscriber.Writer.TryWrite(e);
        }
    }

    private sealed record Subscriber(string UserId, ChannelWriter<BoardEventDto> Writer);
}
