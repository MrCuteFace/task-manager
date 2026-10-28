using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Models.Entities;
using TaskManager.Api.Repositories.Abstractions;

namespace TaskManager.Api.Services;

/// <summary>
/// A board's status vocabulary: the four built-ins every board shares, plus any it has invented.
///
/// The built-ins are **not rows**. They are identical on every board and are produced here with
/// stable, board-independent ids (<c>todo</c>, <c>in-progress</c>, <c>done</c>, <c>stuck</c>), which
/// keeps four duplicate rows per board out of both the seed file and the repository, and means an
/// item on a built-in status stores nothing but its <see cref="ItemStatus"/>, exactly as before.
///
/// Every custom status declares a <see cref="ItemStatus"/> kind. That is what lets overdue,
/// notifications and the charts keep working without knowing any custom name.
/// </summary>
public interface IStatusService
{
    /// <summary>Built-ins first, then the board's own statuses in their order.</summary>
    IReadOnlyList<StatusOptionDto> GetForBoard(string boardId);

    /// <summary>Null when the id is neither a built-in nor one of this board's statuses.</summary>
    StatusOptionDto? Resolve(string boardId, string statusId);

    /// <summary>
    /// Moves an item onto a status by id. A built-in clears <c>StatusId</c> and stores only the
    /// meaning; a custom status stores both. Throws when the id does not belong to the board.
    /// </summary>
    void Apply(Item item, string boardId, string statusId);

    BoardStatus Create(string boardId, CreateStatusRequest request);
    BoardStatus Update(string boardId, string statusId, UpdateStatusRequest request);

    /// <summary>
    /// Removes a custom status and moves every item that was on it back to the built-in matching
    /// its kind, so no item is ever left pointing at a status that no longer exists.
    /// </summary>
    void Delete(string boardId, string statusId);
}

public sealed class StatusService(
    IBoardStatusRepository statuses,
    IGroupRepository groups,
    IItemRepository items) : IStatusService
{
    /// <summary>Stable ids for the four built-ins. They are the same on every board.</summary>
    public static string BuiltInId(ItemStatus kind) => kind switch
    {
        ItemStatus.Todo => "todo",
        ItemStatus.InProgress => "in-progress",
        ItemStatus.Done => "done",
        ItemStatus.Stuck => "stuck",
        _ => "todo",
    };

    /// <summary>
    /// Names and colors mirror the design tokens for the four drawn marks. The client draws a
    /// built-in from its own status law rather than from this color, but the color is sent anyway so
    /// charts and any future consumer have one source for it.
    /// </summary>
    private static readonly (ItemStatus Kind, string Name, string Color)[] BuiltIns =
    [
        (ItemStatus.Todo, "לביצוע", "#6b7280"),
        (ItemStatus.InProgress, "בתהליך", "#d68f00"),
        (ItemStatus.Done, "הושלם", "#2a7048"),
        (ItemStatus.Stuck, "תקוע", "#b53325"),
    ];

    private const int MaxCustomPerBoard = 12;

    public IReadOnlyList<StatusOptionDto> GetForBoard(string boardId)
    {
        var result = BuiltIns
            .Select(b => new StatusOptionDto(BuiltInId(b.Kind), b.Name, b.Color, b.Kind, true))
            .ToList();

        result.AddRange(statuses.GetByBoardId(boardId)
            .Select(s => new StatusOptionDto(s.Id, s.Name, s.Color, s.Kind, false)));

        return result;
    }

    public StatusOptionDto? Resolve(string boardId, string statusId) =>
        GetForBoard(boardId).FirstOrDefault(s => s.Id == statusId);

    public void Apply(Item item, string boardId, string statusId)
    {
        var option = Resolve(boardId, statusId)
            ?? throw new ArgumentException($"Unknown status '{statusId}' for board '{boardId}'.", nameof(statusId));

        item.Status = option.Kind;
        item.StatusId = option.IsBuiltIn ? null : option.Id;
    }

    public BoardStatus Create(string boardId, CreateStatusRequest request)
    {
        var existing = statuses.GetByBoardId(boardId);
        if (existing.Count >= MaxCustomPerBoard)
            throw new ArgumentException($"A board may have at most {MaxCustomPerBoard} custom statuses.", nameof(request));

        var name = NormalizeName(request.Name);
        EnsureNameIsFree(boardId, name, exceptId: null);

        var status = new BoardStatus
        {
            Id = $"st-{Guid.NewGuid():N}"[..12],
            BoardId = boardId,
            Name = name,
            Color = NormalizeColor(request.Color),
            Kind = request.Kind ?? ItemStatus.Todo,
            Order = existing.Count == 0 ? 0 : existing.Max(s => s.Order) + 1,
        };
        statuses.Add(status);
        return status;
    }

    public BoardStatus Update(string boardId, string statusId, UpdateStatusRequest request)
    {
        var status = statuses.Get(statusId);
        if (status is null || status.BoardId != boardId)
            throw new KeyNotFoundException($"Status '{statusId}' does not belong to board '{boardId}'.");

        if (request.Name is not null)
        {
            var name = NormalizeName(request.Name);
            EnsureNameIsFree(boardId, name, exceptId: statusId);
            status.Name = name;
        }
        if (request.Color is not null) status.Color = NormalizeColor(request.Color);
        if (request.Kind is { } kind)
        {
            status.Kind = kind;
            // The kind is the meaning, so every item on this status has to follow it or the board
            // would show one thing while overdue and the charts believed another.
            foreach (var item in ItemsOn(boardId, statusId))
            {
                item.Status = kind;
                items.Update(item);
            }
        }

        statuses.Update(status);
        return status;
    }

    public void Delete(string boardId, string statusId)
    {
        var status = statuses.Get(statusId);
        if (status is null || status.BoardId != boardId)
            throw new KeyNotFoundException($"Status '{statusId}' does not belong to board '{boardId}'.");

        foreach (var item in ItemsOn(boardId, statusId))
        {
            // Keep the meaning, drop the name: the item lands on the built-in it already behaved as.
            item.StatusId = null;
            item.Status = status.Kind;
            items.Update(item);
        }

        statuses.Remove(statusId);
    }

    private IEnumerable<Item> ItemsOn(string boardId, string statusId)
    {
        var groupIds = groups.GetByBoardId(boardId).Select(g => g.Id).ToList();
        return items.GetByGroupIds(groupIds).Where(i => i.StatusId == statusId).ToList();
    }

    private void EnsureNameIsFree(string boardId, string name, string? exceptId)
    {
        var clash = GetForBoard(boardId)
            .Any(s => s.Id != exceptId && string.Equals(s.Name, name, StringComparison.OrdinalIgnoreCase));
        if (clash) throw new ArgumentException($"This board already has a status called '{name}'.", nameof(name));
    }

    private static string NormalizeName(string? raw)
    {
        var name = (raw ?? string.Empty).Trim();
        if (name.Length == 0) throw new ArgumentException("A status needs a name.", nameof(raw));
        if (name.Length > 24) throw new ArgumentException("A status name may be at most 24 characters.", nameof(raw));
        return name;
    }

    /// <summary>Accepts <c>#rgb</c> or <c>#rrggbb</c> and returns the long lowercase form.</summary>
    private static string NormalizeColor(string? raw)
    {
        var color = (raw ?? string.Empty).Trim().ToLowerInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(color, "^#([0-9a-f]{3}|[0-9a-f]{6})$"))
            throw new ArgumentException("Color must be a hex value such as #2c4fb5.", nameof(raw));
        return color.Length == 4
            ? $"#{color[1]}{color[1]}{color[2]}{color[2]}{color[3]}{color[3]}"
            : color;
    }
}
