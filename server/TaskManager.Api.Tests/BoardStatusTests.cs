using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Models.Entities;
using TaskManager.Api.Services;
using TaskManager.Api.Tests.Fixtures;

namespace TaskManager.Api.Tests;

/// <summary>
/// Custom statuses. The point worth proving is that a board can invent any vocabulary it likes
/// while the four meanings the rest of the app reasons about stay intact.
/// </summary>
public class BoardStatusTests
{
    private const string Board = "b-u1";

    private static (ServiceTestFixture Fixture, StatusService Statuses) Build()
    {
        var fixture = new ServiceTestFixture();
        return (fixture, fixture.StatusService);
    }

    private static CreateStatusRequest New(string name, string color = "#2c4fb5", ItemStatus? kind = null) =>
        new(name, color, kind);

    [Fact]
    public void GetForBoard_StartsWithTheFourBuiltIns()
    {
        var (_, statuses) = Build();
        var options = statuses.GetForBoard(Board);

        Assert.Equal(4, options.Count);
        Assert.All(options, o => Assert.True(o.IsBuiltIn));
        Assert.Equal(["todo", "in-progress", "done", "stuck"], options.Select(o => o.Id));
    }

    [Fact]
    public void Create_AddsTheStatusAfterTheBuiltIns()
    {
        var (_, statuses) = Build();
        var created = statuses.Create(Board, New("ממתין לראיון", "#7C3AED", ItemStatus.InProgress));

        var options = statuses.GetForBoard(Board);
        Assert.Equal(5, options.Count);
        Assert.Equal(created.Id, options[^1].Id);
        Assert.False(options[^1].IsBuiltIn);
        Assert.Equal(ItemStatus.InProgress, options[^1].Kind);
    }

    [Fact]
    public void Create_IsScopedToItsOwnBoard()
    {
        var (_, statuses) = Build();
        statuses.Create(Board, New("ממתין לראיון"));

        Assert.Equal(5, statuses.GetForBoard(Board).Count);
        Assert.Equal(4, statuses.GetForBoard("b-u2").Count);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_RejectsABlankName(string name)
    {
        var (_, statuses) = Build();
        Assert.Throws<ArgumentException>(() => statuses.Create(Board, New(name)));
    }

    [Fact]
    public void Create_RejectsAnOverlongName()
    {
        var (_, statuses) = Build();
        Assert.Throws<ArgumentException>(() => statuses.Create(Board, New(new string('א', 25))));
    }

    [Theory]
    [InlineData("blue")]
    [InlineData("#12345")]
    [InlineData("2c4fb5")]
    [InlineData("#gggggg")]
    public void Create_RejectsAMalformedColor(string color)
    {
        var (_, statuses) = Build();
        Assert.Throws<ArgumentException>(() => statuses.Create(Board, New("סטטוס", color)));
    }

    [Fact]
    public void Create_ExpandsAShorthandColor()
    {
        var (_, statuses) = Build();
        var created = statuses.Create(Board, New("סטטוס", "#ABC"));
        Assert.Equal("#aabbcc", created.Color);
    }

    [Fact]
    public void Create_RejectsANameAlreadyUsed_IncludingABuiltIn()
    {
        var (_, statuses) = Build();
        statuses.Create(Board, New("ממתין לראיון"));

        Assert.Throws<ArgumentException>(() => statuses.Create(Board, New("ממתין לראיון")));
        Assert.Throws<ArgumentException>(() => statuses.Create(Board, New("הושלם")));
    }

    [Fact]
    public void Apply_ABuiltIn_StoresOnlyTheMeaning()
    {
        var (fixture, statuses) = Build();
        var item = fixture.Items.Get("i-u1")!;

        statuses.Apply(item, Board, "done");

        Assert.Equal(ItemStatus.Done, item.Status);
        Assert.Null(item.StatusId);
    }

    [Fact]
    public void Apply_ACustomStatus_StoresBothTheMeaningAndTheIdentity()
    {
        var (fixture, statuses) = Build();
        var custom = statuses.Create(Board, New("ממתין לראיון", "#7C3AED", ItemStatus.InProgress));
        var item = fixture.Items.Get("i-u1")!;

        statuses.Apply(item, Board, custom.Id);

        Assert.Equal(ItemStatus.InProgress, item.Status);
        Assert.Equal(custom.Id, item.StatusId);
    }

    [Fact]
    public void Apply_RejectsAStatusFromAnotherBoard()
    {
        var (fixture, statuses) = Build();
        var otherBoards = statuses.Create("b-u2", New("סטטוס של לוח אחר"));
        var item = fixture.Items.Get("i-u1")!;

        Assert.Throws<ArgumentException>(() => statuses.Apply(item, Board, otherBoards.Id));
    }

    [Fact]
    public void ChangingTheKind_MovesEveryItemOnThatStatusToTheNewMeaning()
    {
        var (fixture, statuses) = Build();
        var custom = statuses.Create(Board, New("ממתין לראיון", "#7C3AED", ItemStatus.InProgress));
        var item = fixture.Items.Get("i-u1")!;
        statuses.Apply(item, Board, custom.Id);
        fixture.Items.Update(item);

        statuses.Update(Board, custom.Id, new UpdateStatusRequest(null, null, ItemStatus.Done));

        var reloaded = fixture.Items.Get("i-u1")!;
        Assert.Equal(ItemStatus.Done, reloaded.Status);
        Assert.Equal(custom.Id, reloaded.StatusId);
    }

    [Fact]
    public void Delete_MovesItemsBackToTheBuiltInMatchingTheirMeaning()
    {
        var (fixture, statuses) = Build();
        var custom = statuses.Create(Board, New("ממתין לראיון", "#7C3AED", ItemStatus.Stuck));
        var item = fixture.Items.Get("i-u1")!;
        statuses.Apply(item, Board, custom.Id);
        fixture.Items.Update(item);

        statuses.Delete(Board, custom.Id);

        var reloaded = fixture.Items.Get("i-u1")!;
        Assert.Null(reloaded.StatusId);
        Assert.Equal(ItemStatus.Stuck, reloaded.Status);   // the meaning survives the name
        Assert.Equal(4, statuses.GetForBoard(Board).Count);
    }

    [Fact]
    public void Update_And_Delete_RefuseAStatusFromAnotherBoard()
    {
        var (_, statuses) = Build();
        var other = statuses.Create("b-u2", New("סטטוס של לוח אחר"));

        Assert.Throws<KeyNotFoundException>(() => statuses.Update(Board, other.Id, new UpdateStatusRequest("x", null, null)));
        Assert.Throws<KeyNotFoundException>(() => statuses.Delete(Board, other.Id));
    }

    [Fact]
    public void ItemService_Update_ByStatusId_SetsBothFields()
    {
        var (fixture, statuses) = Build();
        var custom = statuses.Create(Board, New("ממתין לראיון", "#7C3AED", ItemStatus.Stuck));

        var result = fixture.ItemService.Update(
            "u1", "i-u1",
            new UpdateItemRequest(null, null, custom.Id, null, null, null, null, null, null, null, null, null));

        Assert.NotNull(result);
        Assert.Equal(ItemStatus.Stuck, result!.Status);
        Assert.Equal(custom.Id, result.StatusId);
    }

    [Fact]
    public void ItemService_Update_ByPlainStatus_ClearsACustomStatus()
    {
        var (fixture, statuses) = Build();
        var custom = statuses.Create(Board, New("ממתין לראיון", "#7C3AED", ItemStatus.Stuck));
        fixture.ItemService.Update("u1", "i-u1",
            new UpdateItemRequest(null, null, custom.Id, null, null, null, null, null, null, null, null, null));

        var result = fixture.ItemService.Update("u1", "i-u1",
            new UpdateItemRequest(null, ItemStatus.Done, null, null, null, null, null, null, null, null, null, null));

        Assert.NotNull(result);
        Assert.Equal(ItemStatus.Done, result!.Status);
        Assert.Null(result.StatusId);
    }

    [Fact]
    public void BoardDetail_CarriesTheBoardsStatuses()
    {
        var (fixture, statuses) = Build();
        statuses.Create(Board, New("ממתין לראיון"));

        var detail = fixture.BoardService.GetBoard("u1", Board);

        Assert.NotNull(detail);
        Assert.Equal(5, detail!.Statuses.Count);
        Assert.Contains(detail.Statuses, s => s.Name == "ממתין לראיון" && !s.IsBuiltIn);
    }
}
