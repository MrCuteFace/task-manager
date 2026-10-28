using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Models.Entities;
using TaskManager.Api.Tests.Fixtures;

namespace TaskManager.Api.Tests;

public class ItemServiceTests
{
    private static UpdateItemRequest Empty(
        string? title = null, ItemStatus? status = null, List<string>? assigneeIds = null,
        DateOnly? dueDate = null, bool? clearDueDate = null, Priority? priority = null,
        string? notes = null, string? groupId = null, int? order = null, string? statusId = null,
        string? priorityId = null, bool? clearPriority = null) =>
        new(title, status, statusId, assigneeIds, dueDate, clearDueDate, priority, priorityId, clearPriority, notes, groupId, order);

    [Fact]
    public void Update_SetsStatus()
    {
        var fx = new ServiceTestFixture();

        var result = fx.ItemService.Update("u1", fx.ItemIdFor["u1"], Empty(status: ItemStatus.Done));

        Assert.NotNull(result);
        Assert.Equal(ItemStatus.Done, result!.Status);
    }

    [Fact]
    public void Update_ClearDueDate_ClearsIt()
    {
        var fx = new ServiceTestFixture();
        fx.ItemService.Update("u1", fx.ItemIdFor["u1"], Empty(dueDate: DateOnly.FromDateTime(DateTime.Now)));

        var result = fx.ItemService.Update("u1", fx.ItemIdFor["u1"], Empty(clearDueDate: true));

        Assert.NotNull(result);
        Assert.Null(result!.DueDate);
    }

    [Fact]
    public void Update_MovesToAnotherGroupOfSameBoard()
    {
        var fx = new ServiceTestFixture();
        fx.Groups.Add(new Group { Id = "g-u1-second", BoardId = fx.BoardIdFor["u1"], Name = "Second group", Color = "#111111", Order = 1 });

        var result = fx.ItemService.Update("u1", fx.ItemIdFor["u1"], Empty(groupId: "g-u1-second"));

        Assert.NotNull(result);
        Assert.Equal("g-u1-second", result!.GroupId);
    }

    [Fact]
    public void Update_GroupFromDifferentBoard_Throws()
    {
        var fx = new ServiceTestFixture();

        // g-u2 belongs to b-u2, not the board that owns fx.ItemIdFor["u1"] (b-u1).
        Assert.Throws<ArgumentException>(() =>
            fx.ItemService.Update("u1", fx.ItemIdFor["u1"], Empty(groupId: fx.GroupIdFor["u2"])));
    }

    [Fact]
    public void Update_ViewerCannotSeeBoard_ReturnsNull()
    {
        var fx = new ServiceTestFixture();

        // u4 cannot see u2's board (sideways).
        var result = fx.ItemService.Update("u4", fx.ItemIdFor["u2"], Empty(status: ItemStatus.Done));

        Assert.Null(result);
    }

    [Fact]
    public void Update_UnknownAssignee_Throws()
    {
        var fx = new ServiceTestFixture();

        Assert.Throws<ArgumentException>(() =>
            fx.ItemService.Update("u1", fx.ItemIdFor["u1"], Empty(assigneeIds: ["no-such-user"])));
    }
[Fact]
    public void Update_Order_MovesItemWithinGroupAndRenumbersSiblings()
    {
        var fx = new ServiceTestFixture();
        var groupId = fx.GroupIdFor["u1"];
        var first = fx.ItemIdFor["u1"];
        fx.Items.Add(new Item { Id = "x2", GroupId = groupId, Title = "second", Order = 1 });
        fx.Items.Add(new Item { Id = "x3", GroupId = groupId, Title = "third", Order = 2 });

        // Move the third item to the top.
        var result = fx.ItemService.Update("u1", "x3", Empty(order: 0));

        Assert.NotNull(result);
        var ordered = fx.Items.GetByGroupId(groupId).Select(i => (i.Id, i.Order)).ToList();
        Assert.Equal(new[] { ("x3", 0), (first, 1), ("x2", 2) }, ordered);
    }

    [Fact]
    public void Update_GroupId_MovesItemToTargetIndexAndRenumbersBothGroups()
    {
        var fx = new ServiceTestFixture();
        var boardId = fx.BoardIdFor["u1"];
        var sourceGroup = fx.GroupIdFor["u1"];
        fx.Groups.Add(new Group { Id = "g-target", BoardId = boardId, Name = "Target", Color = "#000", Order = 1 });
        fx.Items.Add(new Item { Id = "t1", GroupId = "g-target", Title = "t1", Order = 0 });
        fx.Items.Add(new Item { Id = "t2", GroupId = "g-target", Title = "t2", Order = 1 });
        fx.Items.Add(new Item { Id = "s2", GroupId = sourceGroup, Title = "s2", Order = 1 });
        var moving = fx.ItemIdFor["u1"];

        var result = fx.ItemService.Update("u1", moving, Empty(groupId: "g-target", order: 1));

        Assert.NotNull(result);
        Assert.Equal("g-target", result!.GroupId);
        Assert.Equal(new[] { ("t1", 0), (moving, 1), ("t2", 2) }, fx.Items.GetByGroupId("g-target").Select(i => (i.Id, i.Order)).ToList());
        Assert.Equal(new[] { ("s2", 0) }, fx.Items.GetByGroupId(sourceGroup).Select(i => (i.Id, i.Order)).ToList());
    }
}
