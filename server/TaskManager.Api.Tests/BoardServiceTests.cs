using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Models.Entities;
using TaskManager.Api.Tests.Fixtures;

namespace TaskManager.Api.Tests;

public class BoardServiceTests
{
    [Fact]
    public void GetVisibleBoards_ReturnsBoardsOfSelfAndAllReports()
    {
        var fx = new ServiceTestFixture();

        Assert.Equal(4, fx.BoardService.GetVisibleBoards("u1").Count); // u1,u2,u3,u4
        Assert.Equal(2, fx.BoardService.GetVisibleBoards("u2").Count); // u2,u3
        Assert.Single(fx.BoardService.GetVisibleBoards("u3")); // u3
        Assert.Single(fx.BoardService.GetVisibleBoards("u4")); // u4
    }

    [Fact]
    public void GetBoard_SidewaysOrUpward_ReturnsNull()
    {
        var fx = new ServiceTestFixture();

        Assert.Null(fx.BoardService.GetBoard("u2", fx.BoardIdFor["u4"]));
    }

    [Fact]
    public void GetBoard_Descendant_ReturnsBoard()
    {
        var fx = new ServiceTestFixture();

        Assert.NotNull(fx.BoardService.GetBoard("u2", fx.BoardIdFor["u3"]));
    }

    [Fact]
    public void GetBoard_MissingBoard_ReturnsNull()
    {
        var fx = new ServiceTestFixture();

        Assert.Null(fx.BoardService.GetBoard("u1", "missing"));
    }

    [Fact]
    public void CreateItem_OnVisibleBoard_ReturnsItemWithNextOrderAndTodoDefault()
    {
        var fx = new ServiceTestFixture();
        // g-u1 already has one item (Order 0) from the fixture, so the new item gets Order 1.
        var request = new CreateItemRequest(fx.GroupIdFor["u1"], "New item", null, null, null, null, null, null);

        var item = fx.BoardService.CreateItem("u1", fx.BoardIdFor["u1"], request);

        Assert.NotNull(item);
        Assert.Equal(1, item!.Order);
        Assert.Equal(ItemStatus.Todo, item.Status);
    }

    [Fact]
    public void CreateItem_OnHiddenBoard_ReturnsNull()
    {
        var fx = new ServiceTestFixture();
        var request = new CreateItemRequest(fx.GroupIdFor["u2"], "New item", null, null, null, null, null, null);

        // u4 cannot see u2's board (sideways).
        var item = fx.BoardService.CreateItem("u4", fx.BoardIdFor["u2"], request);

        Assert.Null(item);
    }

    [Fact]
    public void CreateItem_WhitespaceTitle_ThrowsArgumentException()
    {
        var fx = new ServiceTestFixture();
        var request = new CreateItemRequest(fx.GroupIdFor["u1"], "   ", null, null, null, null, null, null);

        Assert.Throws<ArgumentException>(() => fx.BoardService.CreateItem("u1", fx.BoardIdFor["u1"], request));
    }

    [Fact]
    public void CreateItem_GroupFromAnotherBoard_ThrowsArgumentException()
    {
        var fx = new ServiceTestFixture();
        // g-u2 belongs to b-u2, not b-u1.
        var request = new CreateItemRequest(fx.GroupIdFor["u2"], "New item", null, null, null, null, null, null);

        Assert.Throws<ArgumentException>(() => fx.BoardService.CreateItem("u1", fx.BoardIdFor["u1"], request));
    }

    [Fact]
    public void ToSummary_ComputesStatusCountsAndOverdueCount()
    {
        var fx = new ServiceTestFixture();
        var today = DateOnly.FromDateTime(DateTime.Now);
        var yesterday = today.AddDays(-1);

        // Replace the fixture's default item on u1's board with a known set:
        // one Todo (no due date), one Done, one Stuck, and one overdue Todo (due yesterday).
        fx.Items.Remove(fx.ItemIdFor["u1"]);
        fx.Items.Add(new Item { Id = "i-todo", GroupId = fx.GroupIdFor["u1"], Title = "Todo", Status = ItemStatus.Todo, Order = 0 });
        fx.Items.Add(new Item { Id = "i-done", GroupId = fx.GroupIdFor["u1"], Title = "Done", Status = ItemStatus.Done, Order = 1 });
        fx.Items.Add(new Item { Id = "i-stuck", GroupId = fx.GroupIdFor["u1"], Title = "Stuck", Status = ItemStatus.Stuck, Order = 2 });
        fx.Items.Add(new Item { Id = "i-overdue", GroupId = fx.GroupIdFor["u1"], Title = "Overdue", Status = ItemStatus.Todo, DueDate = yesterday, Order = 3 });

        var board = fx.Boards.Get(fx.BoardIdFor["u1"])!;
        var summary = fx.BoardService.ToSummary(board);

        Assert.Equal(2, summary.Counts.Todo);
        Assert.Equal(1, summary.Counts.Done);
        Assert.Equal(1, summary.Counts.Stuck);
        Assert.Equal(0, summary.Counts.InProgress);
        Assert.Equal(1, summary.OverdueCount);
    }

    [Fact]
    public void CreateGroup_AppendsToVisibleBoard_AndHidesOthers()
    {
        var fx = new ServiceTestFixture();
        var boardId = fx.BoardIdFor["u2"];

        var created = fx.BoardService.CreateGroup("u1", boardId, new CreateGroupRequest("מסיבת ראש השנה", null));

        Assert.NotNull(created);
        Assert.Equal("מסיבת ראש השנה", created!.Name);
        Assert.Equal(1, created.Order);
        Assert.Matches("^#[0-9A-Fa-f]{6}$", created.Color);
        Assert.Empty(created.Items);
        Assert.Equal(2, fx.Groups.GetByBoardId(boardId).Count);

        Assert.Null(fx.BoardService.CreateGroup("u4", boardId, new CreateGroupRequest("x", null)));
        Assert.Throws<ArgumentException>(() => fx.BoardService.CreateGroup("u1", boardId, new CreateGroupRequest("  ", null)));
    }
}
