using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Models.Entities;
using TaskManager.Api.Repositories.Abstractions;

namespace TaskManager.Api.Services;

/// <summary>
/// Reference pattern for every entity service: resolve the viewer's visible user set,
/// filter by owner, then map to DTOs. A hidden board and a missing board both return null,
/// so the API never reveals whether something exists outside the viewer's scope.
/// </summary>
public interface IBoardService
{
    IReadOnlyList<BoardSummaryDto> GetVisibleBoards(string viewerId);
    BoardDetailDto? GetBoard(string viewerId, string boardId);
    ItemDto? CreateItem(string viewerId, string boardId, CreateItemRequest request);
    GroupDto? CreateGroup(string viewerId, string boardId, CreateGroupRequest request);
}

public sealed class BoardService(
    IVisibilityService visibility,
    IBoardRepository boards,
    IGroupRepository groups,
    IItemRepository items,
    ISubItemRepository subItems,
    IUpdateRepository updates,
    IStatusService statusService,
    IPriorityService priorityService,
    IAttachmentRepository attachments,
    IWorkspaceRepository workspaces,
    IUserRepository users,
    TimeProvider clock) : IBoardService
{
    public IReadOnlyList<BoardSummaryDto> GetVisibleBoards(string viewerId)
    {
        var visibleUsers = visibility.GetVisibleUserIds(viewerId);
        return boards.GetByOwnerIds(visibleUsers).Select(ToSummary).ToList();
    }

    public BoardDetailDto? GetBoard(string viewerId, string boardId)
    {
        var board = FindVisibleBoard(viewerId, boardId);
        if (board is null) return null;

        var groupDtos = groups.GetByBoardId(board.Id)
            .Select(g => new GroupDto(
                g.Id, g.Name, g.Color, g.Order,
                items.GetByGroupId(g.Id).Select(i => ToItemDto(i, board.Id)).ToList()))
            .ToList();

        return new BoardDetailDto(
            board.Id, board.Name, board.Description,
            board.WorkspaceId, WorkspaceName(board.WorkspaceId),
            board.OwnerUserId, UserName(board.OwnerUserId),
            groupDtos,
            statusService.GetForBoard(board.Id),
            priorityService.GetForBoard(board.Id));
    }

    public ItemDto? CreateItem(string viewerId, string boardId, CreateItemRequest request)
    {
        var board = FindVisibleBoard(viewerId, boardId);
        if (board is null) return null;

        var group = groups.Get(request.GroupId);
        if (group is null || group.BoardId != board.Id)
            throw new ArgumentException($"Group '{request.GroupId}' does not belong to board '{boardId}'.", nameof(request));

        var title = request.Title.Trim();
        if (title.Length == 0)
            throw new ArgumentException("Title is required.", nameof(request));

        var siblings = items.GetByGroupId(group.Id);
        var item = new Item
        {
            Id = NewId("i"),
            GroupId = group.Id,
            Title = title,
            Status = request.Status ?? ItemStatus.Todo,
            AssigneeIds = (request.AssigneeIds ?? []).Distinct().ToList(),
            DueDate = request.DueDate,
            Priority = request.Priority,
            Order = siblings.Count == 0 ? 0 : siblings.Max(s => s.Order) + 1,
        };
        // A status id, when given, is the authority: it carries both the meaning and the identity.
        if (!string.IsNullOrWhiteSpace(request.StatusId)) statusService.Apply(item, board.Id, request.StatusId);
        if (!string.IsNullOrWhiteSpace(request.PriorityId)) priorityService.Apply(item, board.Id, request.PriorityId);
        items.Add(item);
        return ToItemDto(item, board.Id);
    }

    private static readonly string[] GroupPalette =
        ["#2E7D5B", "#B98900", "#1F4E79", "#7C3AED", "#B4532A", "#2563EB", "#DC2626", "#6B7280"];

    public GroupDto? CreateGroup(string viewerId, string boardId, CreateGroupRequest request)
    {
        var board = FindVisibleBoard(viewerId, boardId);
        if (board is null) return null;

        var name = request.Name?.Trim() ?? string.Empty;
        if (name.Length == 0)
            throw new ArgumentException("Group name is required.", nameof(request));

        var existing = groups.GetByBoardId(board.Id);
        var color = request.Color?.Trim();
        if (string.IsNullOrEmpty(color))
            color = GroupPalette[existing.Count % GroupPalette.Length];
        else if (!System.Text.RegularExpressions.Regex.IsMatch(color, "^#[0-9a-fA-F]{6}$"))
            throw new ArgumentException("Color must be a 6-digit hex value.", nameof(request));

        var group = new Group
        {
            Id = NewId("g"),
            BoardId = board.Id,
            Name = name,
            Color = color,
            Order = existing.Count == 0 ? 0 : existing.Max(g => g.Order) + 1,
        };
        groups.Add(group);
        return new GroupDto(group.Id, group.Name, group.Color, group.Order, []);
    }

    // ---- shared helpers used by ItemService too ---------------------------

    public Board? FindVisibleBoard(string viewerId, string boardId)
    {
        var board = boards.Get(boardId);
        if (board is null) return null;
        return visibility.CanSee(viewerId, board.OwnerUserId) ? board : null;
    }

    public ItemDto ToItemDto(Item item, string boardId) => new(
        item.Id, item.GroupId, boardId, item.Title, item.Status, item.StatusId,
        item.AssigneeIds.AsReadOnly(), item.DueDate, item.Priority, item.PriorityId, item.Notes, item.Order,
        subItems.GetByItemId(item.Id).Select(ToSubItemDto).ToList(),
        updates.GetByItemId(item.Id).Select(ToUpdateDto).ToList(),
        attachments.GetByItemId(item.Id).Select(ToAttachmentDto).ToList());

    public AttachmentDto ToAttachmentDto(Attachment a) =>
        new(a.Id, a.ItemId, a.FileName, a.ContentType, a.Size, a.UploadedByUserId, UserName(a.UploadedByUserId), a.UploadedAt);

    public SubItemDto ToSubItemDto(SubItem s) =>
        new(s.Id, s.ItemId, s.Title, s.Status, s.AssigneeIds.AsReadOnly(), s.DueDate, s.Order);

    public UpdateDto ToUpdateDto(Update u)
    {
        var parentAuthor = u.ParentUpdateId is null ? null : updates.Get(u.ParentUpdateId)?.AuthorUserId;
        return new UpdateDto(
            u.Id, u.ItemId, u.AuthorUserId, UserName(u.AuthorUserId), u.Text, u.CreatedAt,
            u.ParentUpdateId, parentAuthor is null ? null : UserName(parentAuthor));
    }

    public BoardSummaryDto ToSummary(Board board)
    {
        var groupIds = groups.GetByBoardId(board.Id).Select(g => g.Id);
        var boardItems = items.GetByGroupIds(groupIds);
        var today = DateOnly.FromDateTime(clock.GetLocalNow().DateTime);
        return new BoardSummaryDto(
            board.Id, board.Name, board.Description,
            board.WorkspaceId, WorkspaceName(board.WorkspaceId),
            board.OwnerUserId, UserName(board.OwnerUserId),
            StatusCounts.From(boardItems.Select(i => i.Status)),
            boardItems.Count(i => IsOverdue(i, today)));
    }

    public static bool IsOverdue(Item item, DateOnly today) =>
        item.DueDate is { } due && due < today && item.Status != ItemStatus.Done;

    public static string NewId(string prefix) => $"{prefix}-{Guid.NewGuid():N}"[..(prefix.Length + 9)];

    private string WorkspaceName(string workspaceId) => workspaces.Get(workspaceId)?.Name ?? workspaceId;

    private string UserName(string userId) => users.Get(userId)?.FullName ?? userId;
}
