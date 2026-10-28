using TaskManager.Api.Models.Entities;
using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Repositories.Abstractions;

namespace TaskManager.Api.Services;

/// <summary>
/// The bell's feed. Nothing is stored and nothing is pushed: the list is derived from the items the
/// viewer can see each time it is asked for, so it cannot drift out of step with the data the way a
/// stored feed would in a demo that reseeds on every restart.
///
/// Four kinds, in the order a manager would care about them:
/// <list type="bullet">
///   <item><description><c>overdue</c> - assigned to me, past its due date, not done.</description></item>
///   <item><description><c>stuck</c> - assigned to me and marked stuck.</description></item>
///   <item><description><c>due-soon</c> - assigned to me, due today or tomorrow.</description></item>
///   <item><description><c>mention</c> - an update on a visible item that names me.</description></item>
/// </list>
/// Read state is the client's business: it lives in the browser, so it survives a server restart
/// that would wipe any in-memory read-set here.
/// </summary>
public interface INotificationService
{
    IReadOnlyList<NotificationDto> GetForUser(string viewerId, int max = 30);
}

public sealed class NotificationService(
    IVisibilityService visibility,
    IUserRepository users,
    IBoardRepository boards,
    IGroupRepository groups,
    IItemRepository items,
    IUpdateRepository updates,
    TimeProvider clock) : INotificationService
{
    public IReadOnlyList<NotificationDto> GetForUser(string viewerId, int max = 30)
    {
        if (users.Get(viewerId) is null) return [];

        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        var visibleUserIds = visibility.GetVisibleUserIds(viewerId);
        var visibleBoards = boards.GetByOwnerIds(visibleUserIds);

        var boardById = visibleBoards.ToDictionary(b => b.Id);
        var boardIdByGroupId = visibleBoards
            .SelectMany(b => groups.GetByBoardId(b.Id).Select(g => (BoardId: b.Id, g.Id)))
            .ToDictionary(x => x.Id, x => x.BoardId);

        var visibleItems = items.GetByGroupIds(boardIdByGroupId.Keys).ToList();
        var me = users.Get(viewerId)!;
        var result = new List<NotificationDto>();

        string BoardName(Item i) => boardById[boardIdByGroupId[i.GroupId]].Name;
        string BoardId(Item i) => boardIdByGroupId[i.GroupId];

        foreach (var item in visibleItems.Where(i => i.AssigneeIds.Contains(viewerId)))
        {
            if (item.Status != ItemStatus.Done && item.DueDate is { } due)
            {
                if (due < today)
                {
                    var days = today.DayNumber - due.DayNumber;
                    result.Add(new NotificationDto(
                        $"overdue:{item.Id}", "overdue", item.Title,
                        days == 1 ? $"באיחור יום אחד · {BoardName(item)}" : $"באיחור {days} ימים · {BoardName(item)}",
                        item.Id, BoardId(item), due.ToDateTime(TimeOnly.MinValue)));
                }
                else if (due.DayNumber - today.DayNumber <= 1)
                {
                    result.Add(new NotificationDto(
                        $"due:{item.Id}", "due-soon", item.Title,
                        due == today ? $"להגשה היום · {BoardName(item)}" : $"להגשה מחר · {BoardName(item)}",
                        item.Id, BoardId(item), due.ToDateTime(TimeOnly.MinValue)));
                }
            }

            if (item.Status == ItemStatus.Stuck)
            {
                result.Add(new NotificationDto(
                    $"stuck:{item.Id}", "stuck", item.Title, $"מסומן כתקוע · {BoardName(item)}",
                    item.Id, BoardId(item), item.DueDate?.ToDateTime(TimeOnly.MinValue) ?? clock.GetUtcNow().UtcDateTime));
            }
        }

        // Mentions: an update by somebody else, on a visible item, naming me.
        var itemById = visibleItems.ToDictionary(i => i.Id);
        var mentions = new[] { $"@{me.Username}", $"@{me.FullName}" };
        foreach (var item in visibleItems)
        {
            foreach (var update in updates.GetByItemId(item.Id))
            {
                if (update.AuthorUserId == viewerId) continue;
                if (!mentions.Any(m => update.Text.Contains(m, StringComparison.OrdinalIgnoreCase))) continue;
                var author = users.Get(update.AuthorUserId);
                result.Add(new NotificationDto(
                    $"mention:{update.Id}", "mention", itemById[item.Id].Title,
                    $"{author?.FullName ?? "מישהו"} תייג אתכם · {BoardName(item)}",
                    item.Id, BoardId(item), update.CreatedAt));
            }
        }

        return result
            .OrderByDescending(n => Weight(n.Kind))
            .ThenByDescending(n => n.At)
            .Take(max)
            .ToList();
    }

    private static int Weight(string kind) => kind switch
    {
        "overdue" => 3,
        "stuck" => 2,
        "due-soon" => 1,
        _ => 0,
    };
}
