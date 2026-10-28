using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Models.Entities;
using TaskManager.Api.Repositories.Abstractions;

namespace TaskManager.Api.Services;

/// <summary>
/// Dashboards aggregate over a set of source boards. Only source boards the viewer can see
/// contribute to the aggregate; a dashboard with no visible source board is treated as not found.
/// </summary>
public interface IDashboardService
{
    IReadOnlyList<DashboardSummaryDto> GetVisibleDashboards(string viewerId);
    DashboardDetailDto? GetDashboard(string viewerId, string dashboardId);
}

public sealed class DashboardService(
    IVisibilityService visibility,
    IDashboardRepository dashboards,
    BoardService boardService,
    IBoardRepository boards,
    IGroupRepository groups,
    IItemRepository items,
    IUserRepository users,
    TimeProvider clock) : IDashboardService
{
    public IReadOnlyList<DashboardSummaryDto> GetVisibleDashboards(string viewerId)
    {
        var visibleUsers = visibility.GetVisibleUserIds(viewerId);
        return dashboards.GetByOwnerIds(visibleUsers).Select(d => ToSummary(d, viewerId)).ToList();
    }

    public DashboardDetailDto? GetDashboard(string viewerId, string dashboardId)
    {
        var dashboard = dashboards.Get(dashboardId);
        if (dashboard is null) return null;
        if (!visibility.CanSee(viewerId, dashboard.OwnerUserId)) return null;

        var visibleBoards = VisibleSourceBoards(dashboard, viewerId);
        if (visibleBoards.Count == 0) return null;

        var boardDtos = visibleBoards.Select(boardService.ToSummary).ToList();

        var boardItems = visibleBoards
            .SelectMany(b => items.GetByGroupIds(groups.GetByBoardId(b.Id).Select(g => g.Id)))
            .ToList();

        var today = DateOnly.FromDateTime(clock.GetLocalNow().DateTime);
        var weekEnd = today.AddDays(6);

        var totals = StatusCounts.From(boardItems.Select(i => i.Status));
        var overdueCount = boardItems.Count(i => BoardService.IsOverdue(i, today));
        var dueThisWeekCount = boardItems.Count(i =>
            i.DueDate is { } due && due >= today && due <= weekEnd && i.Status != ItemStatus.Done);

        var byAssignee = boardItems
            .SelectMany(i => i.AssigneeIds.Select(a => (AssigneeId: a, Item: i)))
            .GroupBy(x => x.AssigneeId)
            .Select(g => new AssigneeLoadDto(
                g.Key,
                users.Get(g.Key)?.FullName ?? g.Key,
                StatusCounts.From(g.Select(x => x.Item.Status))))
            .OrderByDescending(a => a.Counts.Total)
            .ThenBy(a => a.FullName, StringComparer.Ordinal)
            .ToList();

        var boardNameById = visibleBoards.ToDictionary(b => b.Id, b => b.Name);
        var itemBoardId = visibleBoards
            .SelectMany(b => groups.GetByBoardId(b.Id).Select(g => (GroupId: g.Id, BoardId: b.Id)))
            .ToDictionary(x => x.GroupId, x => x.BoardId);

        var overdueItems = boardItems
            .Where(i => BoardService.IsOverdue(i, today))
            .Select(i =>
            {
                var boardId = itemBoardId[i.GroupId];
                var due = i.DueDate!.Value;
                return new OverdueItemDto(
                    i.Id, i.Title, boardId, boardNameById[boardId],
                    i.Status, due, today.DayNumber - due.DayNumber, i.AssigneeIds.AsReadOnly());
            })
            .OrderByDescending(o => o.DaysOverdue)
            .ToList();

        return new DashboardDetailDto(
            dashboard.Id, dashboard.Name, dashboard.Description, dashboard.OwnerUserId,
            totals, overdueCount, dueThisWeekCount, boardDtos, byAssignee, overdueItems);
    }

    private DashboardSummaryDto ToSummary(Dashboard dashboard, string viewerId) =>
        new(dashboard.Id, dashboard.Name, dashboard.Description, dashboard.OwnerUserId,
            VisibleSourceBoards(dashboard, viewerId).Count);

    private List<Board> VisibleSourceBoards(Dashboard dashboard, string viewerId) =>
        dashboard.SourceBoardIds
            .Select(boards.Get)
            .Where(b => b is not null && visibility.CanSee(viewerId, b.OwnerUserId))
            .Select(b => b!)
            .ToList();
}
