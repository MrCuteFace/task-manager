using TaskManager.Api.Models.Entities;

namespace TaskManager.Api.Models.Dtos;

// ---- Auth / users -------------------------------------------------------

public sealed record LoginRequest(string Username, string Password);

public sealed record LoginResponse(string Token, UserDto User);

public sealed record UserDto(string Id, string FullName, string Title, string? ManagerId, string Username, string? AvatarUrl, string? Email)
{
    public static UserDto From(User u) => new(u.Id, u.FullName, u.Title, u.ManagerId, u.Username, u.AvatarUrl, u.Email);
}

/// <summary>
/// Partial profile update for the current user. <c>ClearAvatar</c> removes the photo and
/// <c>ClearEmail</c> removes the address; both win over the matching value field.
/// </summary>
public sealed record UpdateProfileRequest(
    string? FullName,
    string? Title,
    string? AvatarUrl,
    bool? ClearAvatar,
    string? Email,
    bool? ClearEmail);

/// <summary>Changes the current user's password. The current one must match.</summary>
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

// ---- Search -------------------------------------------------------------

/// <summary>One hit from the top-bar search. <c>BoardId</c> is set for items, for navigation.</summary>
public sealed record SearchHitDto(string Kind, string Id, string Title, string? Subtitle, string? BoardId, string? AvatarUrl);

/// <summary>Search results, already limited to what the viewer is allowed to see.</summary>
public sealed record SearchResultsDto(
    IReadOnlyList<SearchHitDto> Boards,
    IReadOnlyList<SearchHitDto> Items,
    IReadOnlyList<SearchHitDto> People)
{
    public int Total => Boards.Count + Items.Count + People.Count;
}

// ---- Notifications ------------------------------------------------------

/// <summary>
/// One derived notification. Nothing is stored: the feed is computed from the items the viewer can
/// see, so it is always true of the current data.
/// </summary>
public sealed record NotificationDto(
    string Id,
    string Kind,
    string Title,
    string Detail,
    string? ItemId,
    string? BoardId,
    DateTime At);

/// <summary>One node of the org chart. <c>Visible</c> is computed for the requesting user.</summary>
public sealed record OrgNodeDto(
    string Id,
    string FullName,
    string Title,
    string? ManagerId,
    string? AvatarUrl,
    bool Visible,
    bool IsCurrentUser,
    IReadOnlyList<OrgNodeDto> Children);

// ---- Boards -------------------------------------------------------------

public sealed record StatusCounts(int Todo, int InProgress, int Done, int Stuck)
{
    public int Total => Todo + InProgress + Done + Stuck;

    public static StatusCounts From(IEnumerable<ItemStatus> statuses)
    {
        int todo = 0, inProgress = 0, done = 0, stuck = 0;
        foreach (var s in statuses)
        {
            switch (s)
            {
                case ItemStatus.Todo: todo++; break;
                case ItemStatus.InProgress: inProgress++; break;
                case ItemStatus.Done: done++; break;
                case ItemStatus.Stuck: stuck++; break;
            }
        }
        return new StatusCounts(todo, inProgress, done, stuck);
    }
}

public sealed record BoardSummaryDto(
    string Id,
    string Name,
    string? Description,
    string WorkspaceId,
    string WorkspaceName,
    string OwnerUserId,
    string OwnerName,
    StatusCounts Counts,
    int OverdueCount);

public sealed record BoardDetailDto(
    string Id,
    string Name,
    string? Description,
    string WorkspaceId,
    string WorkspaceName,
    string OwnerUserId,
    string OwnerName,
    IReadOnlyList<GroupDto> Groups,
    /// <summary>Built-ins first, then this board's own statuses.</summary>
    IReadOnlyList<StatusOptionDto> Statuses,
    /// <summary>Built-in levels first, then this board's own priorities.</summary>
    IReadOnlyList<PriorityOptionDto> Priorities);

public sealed record GroupDto(string Id, string Name, string Color, int Order, IReadOnlyList<ItemDto> Items);

/// <summary>
/// One status a board offers. <c>IsBuiltIn</c> marks the four the whole product shares: the client
/// draws those with its own hand-drawn marks and will not let them be renamed or deleted.
/// <c>Kind</c> is the meaning every custom status borrows.
/// </summary>
public sealed record StatusOptionDto(string Id, string Name, string Color, ItemStatus Kind, bool IsBuiltIn);

public sealed record CreateStatusRequest(string Name, string Color, ItemStatus? Kind);

/// <summary>Partial update; only non-null fields are applied.</summary>
public sealed record UpdateStatusRequest(string? Name, string? Color, ItemStatus? Kind);

/// <summary>
/// One priority a board offers. <c>IsBuiltIn</c> marks the four levels the whole product shares;
/// <c>Kind</c> is the level a custom priority ranks as, and is what sorting reads.
/// </summary>
public sealed record PriorityOptionDto(string Id, string Name, string Color, Priority Kind, bool IsBuiltIn);

public sealed record CreatePriorityRequest(string Name, string Color, Priority? Kind);

/// <summary>Partial update; only non-null fields are applied.</summary>
public sealed record UpdatePriorityRequest(string? Name, string? Color, Priority? Kind);

public sealed record ItemDto(
    string Id,
    string GroupId,
    string BoardId,
    string Title,
    ItemStatus Status,
    /// <summary>The custom status this item is on, or null when it is on a built-in.</summary>
    string? StatusId,
    IReadOnlyList<string> AssigneeIds,
    DateOnly? DueDate,
    Priority? Priority,
    /// <summary>The custom priority this item is on, or null for a built-in level or none.</summary>
    string? PriorityId,
    string? Notes,
    int Order,
    IReadOnlyList<SubItemDto> SubItems,
    IReadOnlyList<UpdateDto> Updates,
    IReadOnlyList<AttachmentDto> Attachments);

public sealed record AttachmentDto(
    string Id,
    string ItemId,
    string FileName,
    string ContentType,
    long Size,
    string UploadedByUserId,
    string UploadedByName,
    DateTime UploadedAt);

public sealed record SubItemDto(
    string Id,
    string ItemId,
    string Title,
    ItemStatus Status,
    IReadOnlyList<string> AssigneeIds,
    DateOnly? DueDate,
    int Order);

public sealed record UpdateDto(
    string Id,
    string ItemId,
    string AuthorUserId,
    string AuthorName,
    string Text,
    DateTime CreatedAt,
    /// <summary>The update this one answers, or null when it opens a thread.</summary>
    string? ParentUpdateId,
    /// <summary>Who wrote the answered update, so a reply can say whom it answers without a second lookup.</summary>
    string? ParentAuthorName);

/// <summary>
/// One live event on a board the viewer may see. <c>Type</c> is the only thing a client should branch
/// on; more types can be added without a new endpoint.
/// </summary>
public sealed record BoardEventDto(
    string Type,
    string BoardId,
    string ItemId,
    UpdateDto? Update)
{
    /// <summary>A comment (or a reply to one) was posted on an item.</summary>
    public const string UpdateCreated = "update.created";
}

/// <summary>A new group at the end of a board. Color defaults to the next palette entry.</summary>
public sealed record CreateGroupRequest(string Name, string? Color);

public sealed record CreateItemRequest(
    string GroupId,
    string Title,
    ItemStatus? Status,
    string? StatusId,
    List<string>? AssigneeIds,
    DateOnly? DueDate,
    Priority? Priority,
    string? PriorityId);

/// <summary>Partial update: only non-null fields are applied. <c>ClearDueDate</c> and <c>ClearPriority</c> remove those values.</summary>
public sealed record UpdateItemRequest(
    string? Title,
    ItemStatus? Status,
    /// <summary>Moves the item onto a status by id, built-in or custom. Wins over <c>Status</c>.</summary>
    string? StatusId,
    List<string>? AssigneeIds,
    DateOnly? DueDate,
    bool? ClearDueDate,
    Priority? Priority,
    /// <summary>Moves the item onto a priority by id, built-in or custom. Wins over <c>Priority</c>.</summary>
    string? PriorityId,
    bool? ClearPriority,
    string? Notes,
    string? GroupId,
    int? Order);

public sealed record UpdateSubItemRequest(string? Title, ItemStatus? Status, List<string>? AssigneeIds);

/// <summary>
/// A comment on an item. <c>ParentUpdateId</c> makes it a reply; it must name an update on the same item.
/// </summary>
public sealed record CreateUpdateRequest(string Text, string? ParentUpdateId = null);

// ---- Dashboards ---------------------------------------------------------

public sealed record DashboardSummaryDto(string Id, string Name, string? Description, string OwnerUserId, int BoardCount);

public sealed record AssigneeLoadDto(string UserId, string FullName, StatusCounts Counts);

public sealed record OverdueItemDto(
    string ItemId,
    string Title,
    string BoardId,
    string BoardName,
    ItemStatus Status,
    DateOnly DueDate,
    int DaysOverdue,
    IReadOnlyList<string> AssigneeIds);

public sealed record DashboardDetailDto(
    string Id,
    string Name,
    string? Description,
    string OwnerUserId,
    StatusCounts Totals,
    int OverdueCount,
    int DueThisWeekCount,
    IReadOnlyList<BoardSummaryDto> Boards,
    IReadOnlyList<AssigneeLoadDto> ByAssignee,
    IReadOnlyList<OverdueItemDto> OverdueItems);
