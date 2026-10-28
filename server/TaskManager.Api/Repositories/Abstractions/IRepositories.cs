using TaskManager.Api.Models.Entities;

namespace TaskManager.Api.Repositories.Abstractions;

/// <summary>
/// Minimal data-access contract. Controllers and services depend only on these
/// interfaces; the demo binds them to in-memory stores, a later phase binds them to EF Core.
/// </summary>
public interface IRepository<T> where T : IEntity
{
    IReadOnlyList<T> GetAll();
    T? Get(string id);
    void Add(T entity);
    void Update(T entity);
    void Remove(string id);
    void Clear();
}

public interface IUserRepository : IRepository<User>
{
    User? GetByUsername(string username);
}

public interface IWorkspaceRepository : IRepository<Workspace>
{
}

public interface IBoardRepository : IRepository<Board>
{
    IReadOnlyList<Board> GetByOwnerIds(IReadOnlySet<string> ownerIds);
}

public interface IGroupRepository : IRepository<Group>
{
    IReadOnlyList<Group> GetByBoardId(string boardId);
}

/// <summary>Only a board's own invented statuses; the four built-ins are not rows.</summary>
public interface IBoardStatusRepository : IRepository<BoardStatus>
{
    IReadOnlyList<BoardStatus> GetByBoardId(string boardId);
}

/// <summary>Only a board's own invented priorities; the four built-in levels are not rows.</summary>
public interface IBoardPriorityRepository : IRepository<BoardPriority>
{
    IReadOnlyList<BoardPriority> GetByBoardId(string boardId);
}

public interface IItemRepository : IRepository<Item>
{
    IReadOnlyList<Item> GetByGroupId(string groupId);
    IReadOnlyList<Item> GetByGroupIds(IEnumerable<string> groupIds);
}

public interface ISubItemRepository : IRepository<SubItem>
{
    IReadOnlyList<SubItem> GetByItemId(string itemId);
}

public interface IUpdateRepository : IRepository<Update>
{
    IReadOnlyList<Update> GetByItemId(string itemId);
}

public interface IAttachmentRepository : IRepository<Attachment>
{
    IReadOnlyList<Attachment> GetByItemId(string itemId);
}

public interface IDashboardRepository : IRepository<Dashboard>
{
    IReadOnlyList<Dashboard> GetByOwnerIds(IReadOnlySet<string> ownerIds);
}
