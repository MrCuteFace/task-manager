namespace TaskManager.Api.Models.Entities;

/// <summary>
/// What a status *means* to the system, as opposed to what it is called on a board.
///
/// These four are the semantics the rest of the app reasons about: overdue skips <c>Done</c>, the
/// notification feed alerts on <c>Stuck</c>, and the charts order by progress. A board may invent
/// any number of its own statuses, but each one declares which of these it behaves like, so none of
/// that logic has to know about custom names. See <see cref="BoardStatus"/>.
/// </summary>
public enum ItemStatus
{
    Todo,
    InProgress,
    Done,
    Stuck,
}

public enum Priority
{
    Low,
    Medium,
    High,
    Critical,
}

public interface IEntity
{
    string Id { get; }
}

public sealed class User : IEntity
{
    public required string Id { get; init; }
    public required string FullName { get; set; }
    public required string Title { get; set; }
    /// <summary>Direct manager ("reports to"). Null for the root of the org tree.</summary>
    public string? ManagerId { get; set; }
    public required string Username { get; init; }
    /// <summary>Work e-mail. Optional: the seed fills it in, and the user may change or clear it.</summary>
    public string? Email { get; set; }
    /// <summary>Optional profile photo as a data URL (demo: kept in memory, never persisted).</summary>
    public string? AvatarUrl { get; set; }
    /// <summary>
    /// Plain text by design of the demo. Never returned by the API. Settable so the user can change
    /// it from the security tab; like everything else here it resets on the next server start.
    /// </summary>
    public required string Password { get; set; }
}

public sealed class Workspace : IEntity
{
    public required string Id { get; init; }
    public required string Name { get; set; }
    public string? Color { get; set; }
}

public sealed class Board : IEntity
{
    public required string Id { get; init; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public required string WorkspaceId { get; set; }
    /// <summary>The manager this board belongs to. Visibility is derived from this field.</summary>
    public required string OwnerUserId { get; set; }
}

public sealed class Group : IEntity
{
    public required string Id { get; init; }
    public required string BoardId { get; set; }
    public required string Name { get; set; }
    public required string Color { get; set; }
    public int Order { get; set; }
}

/// <summary>
/// A status a board has invented for itself: its own name and color, plus the built-in meaning it
/// behaves like. The four built-in statuses are not stored as rows - they are the same on every
/// board and are produced by <c>StatusService</c>, which keeps the seed file and this table free of
/// four identical rows per board.
/// </summary>
public sealed class BoardStatus : IEntity
{
    public required string Id { get; init; }
    public required string BoardId { get; set; }
    public required string Name { get; set; }
    /// <summary>A hex color chosen by the user, e.g. <c>#2c4fb5</c>.</summary>
    public required string Color { get; set; }
    public ItemStatus Kind { get; set; } = ItemStatus.Todo;
    public int Order { get; set; }
}

/// <summary>
/// A priority a board has invented for itself: its own name and color, plus the built-in level it
/// ranks as. Mirrors <see cref="BoardStatus"/> exactly, including built-ins not being stored.
/// </summary>
public sealed class BoardPriority : IEntity
{
    public required string Id { get; init; }
    public required string BoardId { get; set; }
    public required string Name { get; set; }
    /// <summary>A hex color chosen by the user, e.g. <c>#b53325</c>.</summary>
    public required string Color { get; set; }
    /// <summary>Which built-in level this ranks as. Sorting reads this, never the name.</summary>
    public Priority Kind { get; set; } = Priority.Medium;
    public int Order { get; set; }
}

public sealed class Item : IEntity
{
    public required string Id { get; init; }
    public required string GroupId { get; set; }
    public required string Title { get; set; }
    /// <summary>
    /// The item's meaning, and the only status field the rest of the app reasons about. When
    /// <see cref="StatusId"/> names a custom status this mirrors that status's <c>Kind</c>.
    /// </summary>
    public ItemStatus Status { get; set; } = ItemStatus.Todo;
    /// <summary>
    /// The custom status this item is on, or null when it is on one of the four built-ins (in which
    /// case <see cref="Status"/> alone identifies it). Deleting a custom status resets this to null
    /// and leaves <see cref="Status"/> as the item's meaning.
    /// </summary>
    public string? StatusId { get; set; }
    public List<string> AssigneeIds { get; set; } = [];
    public DateOnly? DueDate { get; set; }
    /// <summary>
    /// The item's priority level, and the only priority field sorting reasons about. When
    /// <see cref="PriorityId"/> names a custom priority this mirrors that priority's <c>Kind</c>.
    /// Null means no priority at all, which is not the same as a custom priority.
    /// </summary>
    public Priority? Priority { get; set; }
    /// <summary>
    /// The custom priority this item is on, or null when it is on a built-in level or has none.
    /// </summary>
    public string? PriorityId { get; set; }
    public string? Notes { get; set; }
    public int Order { get; set; }
}

public sealed class SubItem : IEntity
{
    public required string Id { get; init; }
    public required string ItemId { get; set; }
    public required string Title { get; set; }
    public ItemStatus Status { get; set; } = ItemStatus.Todo;
    public List<string> AssigneeIds { get; set; } = [];
    public DateOnly? DueDate { get; set; }
    public int Order { get; set; }
}

public sealed class Update : IEntity
{
    public required string Id { get; init; }
    public required string ItemId { get; set; }
    public required string AuthorUserId { get; set; }
    public required string Text { get; set; }
    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// The update this one answers, or null when it opens a thread. A reply may itself be replied to,
    /// so this is a true parent, not a thread root - the client resolves the root for display.
    /// </summary>
    public string? ParentUpdateId { get; set; }
}

/// <summary>A file attached to an item. Bytes live in memory for the demo.</summary>
public sealed class Attachment : IEntity
{
    public required string Id { get; init; }
    public required string ItemId { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public required string UploadedByUserId { get; set; }
    public DateTime UploadedAt { get; set; }
    public required byte[] Data { get; set; }
    public long Size => Data.LongLength;
}

public sealed class Dashboard : IEntity
{
    public required string Id { get; init; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public required string OwnerUserId { get; set; }
    public List<string> SourceBoardIds { get; set; } = [];
}
