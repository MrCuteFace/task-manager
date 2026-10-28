using TaskManager.Api.Repositories.Abstractions;

namespace TaskManager.Api.Services;

/// <summary>
/// The permission model of the product (spec §3.2, §5.1): a user sees themselves and every
/// manager below them in the org tree, at any depth. Nothing upward, nothing sideways.
/// Every query for boards, items and dashboards must be filtered through this service on the server.
/// </summary>
public interface IVisibilityService
{
    /// <summary>The viewer plus all of their direct and indirect reports. Empty for an unknown user.</summary>
    IReadOnlySet<string> GetVisibleUserIds(string viewerId);

    /// <summary>True when content owned by <paramref name="ownerUserId"/> is visible to the viewer.</summary>
    bool CanSee(string viewerId, string ownerUserId);
}

public sealed class VisibilityService(IUserRepository users) : IVisibilityService
{
    public IReadOnlySet<string> GetVisibleUserIds(string viewerId)
    {
        var visible = new HashSet<string>();
        if (users.Get(viewerId) is null) return visible;

        var childrenByManager = users.GetAll()
            .Where(u => u.ManagerId is not null)
            .GroupBy(u => u.ManagerId!)
            .ToDictionary(g => g.Key, g => g.Select(u => u.Id).ToList());

        // Iterative breadth-first walk; the visited set makes an accidental cycle harmless.
        var queue = new Queue<string>();
        visible.Add(viewerId);
        queue.Enqueue(viewerId);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (!childrenByManager.TryGetValue(current, out var reports)) continue;
            foreach (var reportId in reports)
            {
                if (visible.Add(reportId)) queue.Enqueue(reportId);
            }
        }

        return visible;
    }

    public bool CanSee(string viewerId, string ownerUserId) =>
        GetVisibleUserIds(viewerId).Contains(ownerUserId);
}
