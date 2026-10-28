using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Repositories.Abstractions;

namespace TaskManager.Api.Services;

/// <summary>
/// Users and the org tree. The visible-users list feeds assignee pickers; the org tree is the
/// full company structure with a per-node <c>Visible</c> flag computed for the viewer.
/// </summary>
public interface IUserService
{
    IReadOnlyList<UserDto> GetVisibleUsers(string viewerId);
    OrgNodeDto GetOrgTree(string viewerId);
    UserDto UpdateProfile(string userId, UpdateProfileRequest request);

    /// <summary>
    /// Changes the password after checking the current one. Throws <see cref="ArgumentException"/>
    /// when the new password is too weak and <see cref="UnauthorizedAccessException"/> when the
    /// current one does not match.
    /// </summary>
    void ChangePassword(string userId, ChangePasswordRequest request);
}

public sealed class UserService(IVisibilityService visibility, IUserRepository users) : IUserService
{
    public IReadOnlyList<UserDto> GetVisibleUsers(string viewerId)
    {
        var visibleUsers = visibility.GetVisibleUserIds(viewerId);
        return users.GetAll().Where(u => visibleUsers.Contains(u.Id)).Select(UserDto.From).ToList();
    }

    private const int MaxAvatarBytes = 400_000;

    public UserDto UpdateProfile(string userId, UpdateProfileRequest request)
    {
        var user = users.Get(userId) ?? throw new KeyNotFoundException($"User '{userId}' not found.");

        if (request.FullName is not null)
        {
            var name = request.FullName.Trim();
            if (name.Length < 2) throw new ArgumentException("Full name is too short.", nameof(request));
            user.FullName = name;
        }
        if (request.Title is not null)
        {
            var title = request.Title.Trim();
            if (title.Length == 0) throw new ArgumentException("Title cannot be empty.", nameof(request));
            user.Title = title;
        }
        if (request.ClearEmail == true)
        {
            user.Email = null;
        }
        else if (request.Email is not null)
        {
            var email = request.Email.Trim();
            if (email.Length == 0) throw new ArgumentException("Email cannot be blank; clear it instead.", nameof(request));
            // Deliberately loose: one @, something either side, a dot in the domain. Enough to catch
            // a typo without rejecting addresses that are perfectly legal but unusual.
            if (email.Length > 254 || !System.Text.RegularExpressions.Regex.IsMatch(email, @"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$"))
                throw new ArgumentException("That does not look like an e-mail address.", nameof(request));
            user.Email = email;
        }
        if (request.ClearAvatar == true)
        {
            user.AvatarUrl = null;
        }
        else if (request.AvatarUrl is not null)
        {
            var url = request.AvatarUrl.Trim();
            if (!url.StartsWith("data:image/png;base64,", StringComparison.Ordinal)
                && !url.StartsWith("data:image/jpeg;base64,", StringComparison.Ordinal)
                && !url.StartsWith("data:image/webp;base64,", StringComparison.Ordinal))
                throw new ArgumentException("Avatar must be a PNG, JPEG or WebP data URL.", nameof(request));
            if (url.Length > MaxAvatarBytes)
                throw new ArgumentException("Avatar image is too large (max 400 KB).", nameof(request));
            user.AvatarUrl = url;
        }

        users.Update(user);
        return UserDto.From(user);
    }

    /// <summary>Minimum length for a new password. The demo's own seed passwords are shorter.</summary>
    private const int MinPasswordLength = 8;

    public void ChangePassword(string userId, ChangePasswordRequest request)
    {
        var user = users.Get(userId) ?? throw new KeyNotFoundException($"User '{userId}' not found.");

        // Ordinal, not culture-aware: a password is bytes, not text in a language.
        if (!string.Equals(user.Password, request.CurrentPassword, StringComparison.Ordinal))
            throw new UnauthorizedAccessException("The current password is incorrect.");

        var next = request.NewPassword ?? string.Empty;
        if (next.Length < MinPasswordLength)
            throw new ArgumentException($"The new password must be at least {MinPasswordLength} characters.", nameof(request));
        if (string.Equals(next, user.Password, StringComparison.Ordinal))
            throw new ArgumentException("The new password must differ from the current one.", nameof(request));

        user.Password = next;
        users.Update(user);
    }

    public OrgNodeDto GetOrgTree(string viewerId)
    {
        var visibleUsers = visibility.GetVisibleUserIds(viewerId);
        var all = users.GetAll();
        var root = all.First(u => u.ManagerId is null);

        var childrenByManager = all
            .Where(u => u.ManagerId is not null)
            .GroupBy(u => u.ManagerId!)
            .ToDictionary(g => g.Key, g => g.Select(u => u.Id).ToList());

        var visited = new HashSet<string>();
        return BuildNode(root.Id, all.ToDictionary(u => u.Id), childrenByManager, visibleUsers, viewerId, visited);
    }

    private static OrgNodeDto BuildNode(
        string userId,
        IReadOnlyDictionary<string, Models.Entities.User> byId,
        IReadOnlyDictionary<string, List<string>> childrenByManager,
        IReadOnlySet<string> visibleUsers,
        string viewerId,
        HashSet<string> visited)
    {
        var user = byId[userId];
        visited.Add(userId);

        var childNodes = new List<OrgNodeDto>();
        if (childrenByManager.TryGetValue(userId, out var ids))
        {
            foreach (var childId in ids)
            {
                if (!byId.ContainsKey(childId)) continue;
                if (visited.Contains(childId)) continue; // guards against a bad/cyclic seed
                childNodes.Add(BuildNode(childId, byId, childrenByManager, visibleUsers, viewerId, visited));
            }
        }

        return new OrgNodeDto(
            user.Id,
            user.FullName,
            user.Title,
            user.ManagerId,
            user.AvatarUrl,
            visibleUsers.Contains(user.Id),
            user.Id == viewerId,
            childNodes);
    }
}
