using TaskManager.Api.Models.Entities;
using TaskManager.Api.Repositories.Abstractions;

namespace TaskManager.Api.Repositories.InMemory;

/// <summary>
/// Demo data provider: everything lives in process memory and resets on restart.
/// Insertion order is preserved so seed order is the default display order.
/// </summary>
public class InMemoryRepository<T> : IRepository<T> where T : IEntity
{
    private readonly Dictionary<string, T> _byId = new();
    private readonly List<string> _order = [];
    private readonly object _gate = new();

    public IReadOnlyList<T> GetAll()
    {
        lock (_gate)
        {
            return _order.Select(id => _byId[id]).ToList();
        }
    }

    public T? Get(string id)
    {
        lock (_gate)
        {
            return _byId.TryGetValue(id, out var entity) ? entity : default;
        }
    }

    public void Add(T entity)
    {
        lock (_gate)
        {
            if (!_byId.TryAdd(entity.Id, entity))
                throw new InvalidOperationException($"{typeof(T).Name} with id '{entity.Id}' already exists.");
            _order.Add(entity.Id);
        }
    }

    public void Update(T entity)
    {
        lock (_gate)
        {
            if (!_byId.ContainsKey(entity.Id))
                throw new KeyNotFoundException($"{typeof(T).Name} with id '{entity.Id}' not found.");
            _byId[entity.Id] = entity;
        }
    }

    public void Remove(string id)
    {
        lock (_gate)
        {
            if (_byId.Remove(id)) _order.Remove(id);
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            _byId.Clear();
            _order.Clear();
        }
    }
}

public sealed class InMemoryUserRepository : InMemoryRepository<User>, IUserRepository
{
    public User? GetByUsername(string username) =>
        GetAll().FirstOrDefault(u => string.Equals(u.Username, username, StringComparison.OrdinalIgnoreCase));
}

public sealed class InMemoryWorkspaceRepository : InMemoryRepository<Workspace>, IWorkspaceRepository
{
}

public sealed class InMemoryBoardRepository : InMemoryRepository<Board>, IBoardRepository
{
    public IReadOnlyList<Board> GetByOwnerIds(IReadOnlySet<string> ownerIds) =>
        GetAll().Where(b => ownerIds.Contains(b.OwnerUserId)).ToList();
}

public sealed class InMemoryGroupRepository : InMemoryRepository<Group>, IGroupRepository
{
    public IReadOnlyList<Group> GetByBoardId(string boardId) =>
        GetAll().Where(g => g.BoardId == boardId).OrderBy(g => g.Order).ToList();
}

public sealed class InMemoryBoardStatusRepository : InMemoryRepository<BoardStatus>, IBoardStatusRepository
{
    public IReadOnlyList<BoardStatus> GetByBoardId(string boardId) =>
        GetAll().Where(s => s.BoardId == boardId).OrderBy(s => s.Order).ToList();
}

public sealed class InMemoryBoardPriorityRepository : InMemoryRepository<BoardPriority>, IBoardPriorityRepository
{
    public IReadOnlyList<BoardPriority> GetByBoardId(string boardId) =>
        GetAll().Where(p => p.BoardId == boardId).OrderBy(p => p.Order).ToList();
}

public sealed class InMemoryItemRepository : InMemoryRepository<Item>, IItemRepository
{
    public IReadOnlyList<Item> GetByGroupId(string groupId) =>
        GetAll().Where(i => i.GroupId == groupId).OrderBy(i => i.Order).ToList();

    public IReadOnlyList<Item> GetByGroupIds(IEnumerable<string> groupIds)
    {
        var set = groupIds.ToHashSet();
        return GetAll().Where(i => set.Contains(i.GroupId)).OrderBy(i => i.Order).ToList();
    }
}

public sealed class InMemorySubItemRepository : InMemoryRepository<SubItem>, ISubItemRepository
{
    public IReadOnlyList<SubItem> GetByItemId(string itemId) =>
        GetAll().Where(s => s.ItemId == itemId).OrderBy(s => s.Order).ToList();
}

public sealed class InMemoryUpdateRepository : InMemoryRepository<Update>, IUpdateRepository
{
    public IReadOnlyList<Update> GetByItemId(string itemId) =>
        GetAll().Where(u => u.ItemId == itemId).OrderBy(u => u.CreatedAt).ToList();
}

public sealed class InMemoryAttachmentRepository : InMemoryRepository<Attachment>, IAttachmentRepository
{
    public IReadOnlyList<Attachment> GetByItemId(string itemId) =>
        GetAll().Where(a => a.ItemId == itemId).OrderBy(a => a.UploadedAt).ToList();
}

public sealed class InMemoryDashboardRepository : InMemoryRepository<Dashboard>, IDashboardRepository
{
    public IReadOnlyList<Dashboard> GetByOwnerIds(IReadOnlySet<string> ownerIds) =>
        GetAll().Where(d => ownerIds.Contains(d.OwnerUserId)).ToList();
}
