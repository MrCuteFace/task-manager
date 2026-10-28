using TaskManager.Api.Models.Entities;
using TaskManager.Api.Repositories.InMemory;
using TaskManager.Api.Services;

namespace TaskManager.Api.Tests.Fixtures;

/// <summary>
/// Builds an in-memory repository set shared by BoardServiceTests and ItemServiceTests:
/// users u1..u4 in the org tree described in the task (u1 root; u2,u4 report to u1; u3 reports to u2),
/// one workspace, one board per user (owned by u1..u4), one group per board and one item per board.
/// </summary>
public sealed class ServiceTestFixture
{
    public InMemoryUserRepository Users { get; } = new();
    public InMemoryWorkspaceRepository Workspaces { get; } = new();
    public InMemoryBoardRepository Boards { get; } = new();
    public InMemoryGroupRepository Groups { get; } = new();
    public InMemoryItemRepository Items { get; } = new();
    public InMemorySubItemRepository SubItems { get; } = new();
    public InMemoryUpdateRepository Updates { get; } = new();
    public InMemoryAttachmentRepository Attachments { get; } = new();
    public InMemoryBoardStatusRepository BoardStatuses { get; } = new();
    public InMemoryBoardPriorityRepository BoardPriorities { get; } = new();
    public VisibilityService Visibility { get; }
    public BoardEventBroker Events { get; }
    public StatusService StatusService { get; }
    public PriorityService PriorityService { get; }
    public BoardService BoardService { get; }
    public ItemService ItemService { get; }

    /// <summary>Board id owned by each of u1..u4, e.g. BoardIdFor["u1"].</summary>
    public IReadOnlyDictionary<string, string> BoardIdFor { get; }

    /// <summary>Group id on each user's board.</summary>
    public IReadOnlyDictionary<string, string> GroupIdFor { get; }

    /// <summary>Item id on each user's board.</summary>
    public IReadOnlyDictionary<string, string> ItemIdFor { get; }

    public ServiceTestFixture(TimeProvider? clock = null)
    {
        clock ??= TimeProvider.System;

        Users.Add(new User { Id = "u1", FullName = "Amit Rozen", Title = "CEO", ManagerId = null, Username = "amit", Password = "demo123" });
        Users.Add(new User { Id = "u2", FullName = "Yossi Levi", Title = "HR Manager", ManagerId = "u1", Username = "yossi", Password = "demo123" });
        Users.Add(new User { Id = "u3", FullName = "Maya Sagi", Title = "Recruiting Lead", ManagerId = "u2", Username = "maya", Password = "demo123" });
        Users.Add(new User { Id = "u4", FullName = "Uri Barak", Title = "Marketing Manager", ManagerId = "u1", Username = "uri", Password = "demo123" });

        Workspaces.Add(new Workspace { Id = "w1", Name = "Workspace 1" });

        var boardIds = new Dictionary<string, string>();
        var groupIds = new Dictionary<string, string>();
        var itemIds = new Dictionary<string, string>();

        foreach (var userId in new[] { "u1", "u2", "u3", "u4" })
        {
            var boardId = $"b-{userId}";
            var groupId = $"g-{userId}";
            var itemId = $"i-{userId}";

            Boards.Add(new Board { Id = boardId, Name = $"Board {userId}", WorkspaceId = "w1", OwnerUserId = userId });
            Groups.Add(new Group { Id = groupId, BoardId = boardId, Name = $"Group {userId}", Color = "#000000", Order = 0 });
            Items.Add(new Item { Id = itemId, GroupId = groupId, Title = $"Item {userId}", Order = 0 });

            boardIds[userId] = boardId;
            groupIds[userId] = groupId;
            itemIds[userId] = itemId;
        }

        BoardIdFor = boardIds;
        GroupIdFor = groupIds;
        ItemIdFor = itemIds;

        Visibility = new VisibilityService(Users);
        Events = new BoardEventBroker(Visibility);
        StatusService = new StatusService(BoardStatuses, Groups, Items);
        PriorityService = new PriorityService(BoardPriorities, Groups, Items);
        BoardService = new BoardService(Visibility, Boards, Groups, Items, SubItems, Updates, StatusService, PriorityService, Attachments, Workspaces, Users, clock);
        ItemService = new ItemService(BoardService, Groups, Items, SubItems, Updates, Attachments, StatusService, PriorityService, Users, Events, clock);
    }
}
