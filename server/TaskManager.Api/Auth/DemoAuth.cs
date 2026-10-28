using System.Collections.Concurrent;
using Microsoft.AspNetCore.Mvc;
using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Models.Entities;
using TaskManager.Api.Repositories.Abstractions;

namespace TaskManager.Api.Auth;

/// <summary>
/// Demo session store: an opaque token per login, kept in memory.
/// Replaced by JWT or organizational SSO in a later phase (tech doc §11).
/// </summary>
public interface ISessionStore
{
    string Create(string userId);
    string? Resolve(string token);
    void Revoke(string token);
}

public sealed class InMemorySessionStore : ISessionStore
{
    private readonly ConcurrentDictionary<string, string> _userIdByToken = new();

    public string Create(string userId)
    {
        var token = Guid.NewGuid().ToString("N");
        _userIdByToken[token] = userId;
        return token;
    }

    public string? Resolve(string token) =>
        _userIdByToken.TryGetValue(token, out var userId) ? userId : null;

    public void Revoke(string token) => _userIdByToken.TryRemove(token, out _);
}

/// <summary>The user resolved for the current request by <see cref="DemoAuthMiddleware"/>.</summary>
public interface ICurrentUser
{
    string UserId { get; }
    User User { get; }
}

public sealed class CurrentUserAccessor(IHttpContextAccessor accessor, IUserRepository users) : ICurrentUser
{
    public string UserId =>
        accessor.HttpContext?.Items[DemoAuthMiddleware.UserIdKey] as string
        ?? throw new InvalidOperationException("No authenticated user on this request.");

    public User User =>
        users.Get(UserId) ?? throw new InvalidOperationException($"Authenticated user '{UserId}' no longer exists.");
}

/// <summary>
/// Resolves <c>Authorization: Bearer &lt;token&gt;</c> to a user for every /api route except login.
/// Returns 401 as a ProblemDetails body when the token is missing or unknown.
/// </summary>
public sealed class DemoAuthMiddleware(RequestDelegate next)
{
    public const string UserIdKey = "TaskManager.CurrentUserId";
    private const string BearerPrefix = "Bearer ";

    public async Task InvokeAsync(HttpContext context, ISessionStore sessions, IUserRepository users)
    {
        var path = context.Request.Path;
        var isProtected = path.StartsWithSegments("/api")
                          && !path.StartsWithSegments("/api/auth/login")
                          && !HttpMethods.IsOptions(context.Request.Method);

        if (!isProtected)
        {
            await next(context);
            return;
        }

        var header = context.Request.Headers.Authorization.ToString();
        if (header.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            var token = header[BearerPrefix.Length..].Trim();
            var userId = sessions.Resolve(token);
            if (userId is not null && users.Get(userId) is not null)
            {
                context.Items[UserIdKey] = userId;
                await next(context);
                return;
            }
        }

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = StatusCodes.Status401Unauthorized,
            Title = "Unauthorized",
            Detail = "Missing or invalid session token.",
        }, options: null, contentType: "application/problem+json");
    }
}

public interface IAuthService
{
    /// <summary>Validates against the fixed demo users. Null when the credentials do not match.</summary>
    LoginResponse? Login(LoginRequest request);

    void Logout(string token);
}

public sealed class AuthService(IUserRepository users, ISessionStore sessions) : IAuthService
{
    public LoginResponse? Login(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrEmpty(request.Password))
            return null;

        var user = users.GetByUsername(request.Username.Trim());
        // Demo-only comparison against the plain-text seed password (tech doc §4.2).
        if (user is null || !string.Equals(user.Password, request.Password, StringComparison.Ordinal))
            return null;

        var token = sessions.Create(user.Id);
        return new LoginResponse(token, UserDto.From(user));
    }

    public void Logout(string token) => sessions.Revoke(token);
}
