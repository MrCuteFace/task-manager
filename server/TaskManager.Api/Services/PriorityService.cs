using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Models.Entities;
using TaskManager.Api.Repositories.Abstractions;

namespace TaskManager.Api.Services;

/// <summary>
/// A board's priority vocabulary, built exactly like <see cref="IStatusService"/>: the four built-in
/// levels every board shares, plus any the board has invented.
///
/// The built-ins are not rows - they are produced here with stable ids (<c>critical</c>, <c>high</c>,
/// <c>medium</c>, <c>low</c>). Every custom priority declares the level it ranks as, and that is what
/// sorting reads, so a board can call a level anything without breaking the priority column's order.
///
/// One difference from statuses: an item may have **no** priority at all, which is not a level and
/// therefore not an option here. That stays as a null <c>Priority</c> on the item.
/// </summary>
public interface IPriorityService
{
    /// <summary>Built-ins first (highest level first), then the board's own.</summary>
    IReadOnlyList<PriorityOptionDto> GetForBoard(string boardId);

    PriorityOptionDto? Resolve(string boardId, string priorityId);

    BoardPriority Create(string boardId, CreatePriorityRequest request);
    BoardPriority Update(string boardId, string priorityId, UpdatePriorityRequest request);

    /// <summary>
    /// Removes a custom priority and moves every item on it back to the built-in level it already
    /// ranked as, so no item is left pointing at a priority that no longer exists.
    /// </summary>
    void Delete(string boardId, string priorityId);

    /// <summary>
    /// Moves an item onto a priority by id. A built-in clears <c>PriorityId</c> and stores only the
    /// level; a custom priority stores both.
    /// </summary>
    void Apply(Item item, string boardId, string priorityId);
}

public sealed class PriorityService(
    IBoardPriorityRepository priorities,
    IGroupRepository groups,
    IItemRepository items) : IPriorityService
{
    public static string BuiltInId(Priority kind) => kind switch
    {
        Priority.Critical => "critical",
        Priority.High => "high",
        Priority.Medium => "medium",
        Priority.Low => "low",
        _ => "medium",
    };

    /// <summary>
    /// Highest first, the order the picker shows. The colors mirror the ink weights the built-in
    /// levels are drawn with - the client still draws those from its own rules, not from this value.
    /// </summary>
    private static readonly (Priority Kind, string Name, string Color)[] BuiltIns =
    [
        (Priority.Critical, "קריטית", "#b53325"),
        (Priority.High, "גבוהה", "#1e2a44"),
        (Priority.Medium, "בינונית", "#4a5568"),
        (Priority.Low, "נמוכה", "#646b7a"),
    ];

    private const int MaxCustomPerBoard = 12;

    public IReadOnlyList<PriorityOptionDto> GetForBoard(string boardId)
    {
        var result = BuiltIns
            .Select(b => new PriorityOptionDto(BuiltInId(b.Kind), b.Name, b.Color, b.Kind, true))
            .ToList();

        result.AddRange(priorities.GetByBoardId(boardId)
            .Select(p => new PriorityOptionDto(p.Id, p.Name, p.Color, p.Kind, false)));

        return result;
    }

    public PriorityOptionDto? Resolve(string boardId, string priorityId) =>
        GetForBoard(boardId).FirstOrDefault(p => p.Id == priorityId);

    public void Apply(Item item, string boardId, string priorityId)
    {
        var option = Resolve(boardId, priorityId)
            ?? throw new ArgumentException($"Unknown priority '{priorityId}' for board '{boardId}'.", nameof(priorityId));

        item.Priority = option.Kind;
        item.PriorityId = option.IsBuiltIn ? null : option.Id;
    }

    public BoardPriority Create(string boardId, CreatePriorityRequest request)
    {
        var existing = priorities.GetByBoardId(boardId);
        if (existing.Count >= MaxCustomPerBoard)
            throw new ArgumentException($"A board may have at most {MaxCustomPerBoard} custom priorities.", nameof(request));

        var name = NormalizeName(request.Name);
        EnsureNameIsFree(boardId, name, exceptId: null);

        var priority = new BoardPriority
        {
            Id = $"pr-{Guid.NewGuid():N}"[..12],
            BoardId = boardId,
            Name = name,
            Color = NormalizeColor(request.Color),
            Kind = request.Kind ?? Priority.Medium,
            Order = existing.Count == 0 ? 0 : existing.Max(p => p.Order) + 1,
        };
        priorities.Add(priority);
        return priority;
    }

    public BoardPriority Update(string boardId, string priorityId, UpdatePriorityRequest request)
    {
        var priority = priorities.Get(priorityId);
        if (priority is null || priority.BoardId != boardId)
            throw new KeyNotFoundException($"Priority '{priorityId}' does not belong to board '{boardId}'.");

        if (request.Name is not null)
        {
            var name = NormalizeName(request.Name);
            EnsureNameIsFree(boardId, name, exceptId: priorityId);
            priority.Name = name;
        }
        if (request.Color is not null) priority.Color = NormalizeColor(request.Color);
        if (request.Kind is { } kind)
        {
            priority.Kind = kind;
            // The level is what sorting reads, so items on this priority have to follow it or the
            // column would order by something the board no longer shows.
            foreach (var item in ItemsOn(boardId, priorityId))
            {
                item.Priority = kind;
                items.Update(item);
            }
        }

        priorities.Update(priority);
        return priority;
    }

    public void Delete(string boardId, string priorityId)
    {
        var priority = priorities.Get(priorityId);
        if (priority is null || priority.BoardId != boardId)
            throw new KeyNotFoundException($"Priority '{priorityId}' does not belong to board '{boardId}'.");

        foreach (var item in ItemsOn(boardId, priorityId))
        {
            // Keep the level, drop the name.
            item.PriorityId = null;
            item.Priority = priority.Kind;
            items.Update(item);
        }

        priorities.Remove(priorityId);
    }

    private IEnumerable<Item> ItemsOn(string boardId, string priorityId)
    {
        var groupIds = groups.GetByBoardId(boardId).Select(g => g.Id).ToList();
        return items.GetByGroupIds(groupIds).Where(i => i.PriorityId == priorityId).ToList();
    }

    private void EnsureNameIsFree(string boardId, string name, string? exceptId)
    {
        var clash = GetForBoard(boardId)
            .Any(p => p.Id != exceptId && string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase));
        if (clash) throw new ArgumentException($"This board already has a priority called '{name}'.", nameof(name));
    }

    private static string NormalizeName(string? raw)
    {
        var name = (raw ?? string.Empty).Trim();
        if (name.Length == 0) throw new ArgumentException("A priority needs a name.", nameof(raw));
        if (name.Length > 24) throw new ArgumentException("A priority name may be at most 24 characters.", nameof(raw));
        return name;
    }

    /// <summary>Accepts <c>#rgb</c> or <c>#rrggbb</c> and returns the long lowercase form.</summary>
    private static string NormalizeColor(string? raw)
    {
        var color = (raw ?? string.Empty).Trim().ToLowerInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(color, "^#([0-9a-f]{3}|[0-9a-f]{6})$"))
            throw new ArgumentException("Color must be a hex value such as #b53325.", nameof(raw));
        return color.Length == 4
            ? $"#{color[1]}{color[1]}{color[2]}{color[2]}{color[3]}{color[3]}"
            : color;
    }
}
