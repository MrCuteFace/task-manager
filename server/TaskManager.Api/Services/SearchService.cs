using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Repositories.Abstractions;

namespace TaskManager.Api.Services;

/// <summary>
/// The top bar's search across boards, items and people.
///
/// Every branch starts from <see cref="IVisibilityService"/>, exactly as the board and dashboard
/// services do: a search that reached past the org tree would be a hole straight through the
/// product's only real rule. Boards are filtered by owner, items by the board they belong to, and
/// people by the visible-user set.
/// </summary>
public interface ISearchService
{
    SearchResultsDto Search(string viewerId, string query, int perKind = 5);
}

public sealed class SearchService(
    IVisibilityService visibility,
    IUserRepository users,
    IBoardRepository boards,
    IGroupRepository groups,
    IItemRepository items) : ISearchService
{
    public SearchResultsDto Search(string viewerId, string query, int perKind = 5)
    {
        var q = (query ?? string.Empty).Trim();
        if (q.Length < 2) return new SearchResultsDto([], [], []);

        var visibleUserIds = visibility.GetVisibleUserIds(viewerId);
        var visibleBoards = boards.GetByOwnerIds(visibleUserIds);

        var boardHits = visibleBoards
            .Where(b => Matches(b.Name, q) || Matches(b.Description, q))
            .OrderBy(b => Rank(b.Name, q))
            .ThenBy(b => b.Name, StringComparer.Ordinal)
            .Take(perKind)
            .Select(b => new SearchHitDto("board", b.Id, b.Name, b.Description, b.Id, null))
            .ToList();

        // Items are reached only through boards the viewer can already see.
        var boardById = visibleBoards.ToDictionary(b => b.Id);
        var groupsByBoard = visibleBoards
            .SelectMany(b => groups.GetByBoardId(b.Id).Select(g => (Board: b, Group: g)))
            .ToList();
        var boardIdByGroupId = groupsByBoard.ToDictionary(x => x.Group.Id, x => x.Board.Id);

        var itemHits = items.GetByGroupIds(boardIdByGroupId.Keys)
            .Where(i => Matches(i.Title, q) || Matches(i.Notes, q))
            .OrderBy(i => Rank(i.Title, q))
            .ThenBy(i => i.Title, StringComparer.Ordinal)
            .Take(perKind)
            .Select(i =>
            {
                var boardId = boardIdByGroupId[i.GroupId];
                return new SearchHitDto("item", i.Id, i.Title, boardById[boardId].Name, boardId, null);
            })
            .ToList();

        var peopleHits = users.GetAll()
            .Where(u => visibleUserIds.Contains(u.Id))
            .Where(u => Matches(u.FullName, q) || Matches(u.Title, q) || Matches(u.Username, q) || Matches(u.Email, q))
            .OrderBy(u => Rank(u.FullName, q))
            .ThenBy(u => u.FullName, StringComparer.Ordinal)
            .Take(perKind)
            .Select(u => new SearchHitDto("person", u.Id, u.FullName, u.Title, null, u.AvatarUrl))
            .ToList();

        return new SearchResultsDto(boardHits, itemHits, peopleHits);
    }

    // Case-insensitive contains. Hebrew has no case, but usernames and e-mail are Latin.
    private static bool Matches(string? value, string q) =>
        value is not null && value.Contains(q, StringComparison.OrdinalIgnoreCase);

    /// <summary>A prefix match outranks a match in the middle of the text.</summary>
    private static int Rank(string value, string q) =>
        value.StartsWith(q, StringComparison.OrdinalIgnoreCase) ? 0 : 1;
}
