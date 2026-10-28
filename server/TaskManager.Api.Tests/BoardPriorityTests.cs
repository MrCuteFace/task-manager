using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Models.Entities;
using TaskManager.Api.Services;
using TaskManager.Api.Tests.Fixtures;

namespace TaskManager.Api.Tests;

/// <summary>
/// Custom priorities. Mirrors <see cref="BoardStatusTests"/>: a board may name a level whatever it
/// likes, and the level it ranks as is what sorting keeps reading.
/// </summary>
public class BoardPriorityTests
{
    private const string Board = "b-u1";

    private static (ServiceTestFixture Fixture, PriorityService Priorities) Build()
    {
        var fixture = new ServiceTestFixture();
        return (fixture, fixture.PriorityService);
    }

    private static CreatePriorityRequest New(string name, string color = "#b53325", Priority? kind = null) =>
        new(name, color, kind);

    [Fact]
    public void GetForBoard_StartsWithTheFourLevels_HighestFirst()
    {
        var (_, priorities) = Build();
        var options = priorities.GetForBoard(Board);

        Assert.Equal(4, options.Count);
        Assert.All(options, o => Assert.True(o.IsBuiltIn));
        Assert.Equal(["critical", "high", "medium", "low"], options.Select(o => o.Id));
    }

    [Fact]
    public void Create_AddsAfterTheBuiltIns_AndIsScopedToItsBoard()
    {
        var (_, priorities) = Build();
        var created = priorities.Create(Board, New("חוסם שחרור", "#7C3AED", Priority.Critical));

        var options = priorities.GetForBoard(Board);
        Assert.Equal(5, options.Count);
        Assert.Equal(created.Id, options[^1].Id);
        Assert.Equal(Priority.Critical, options[^1].Kind);
        Assert.Equal(4, priorities.GetForBoard("b-u2").Count);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_RejectsABlankName(string name)
    {
        var (_, priorities) = Build();
        Assert.Throws<ArgumentException>(() => priorities.Create(Board, New(name)));
    }

    [Theory]
    [InlineData("red")]
    [InlineData("#12345")]
    [InlineData("b53325")]
    public void Create_RejectsAMalformedColor(string color)
    {
        var (_, priorities) = Build();
        Assert.Throws<ArgumentException>(() => priorities.Create(Board, New("עדיפות", color)));
    }

    [Fact]
    public void Create_ExpandsAShorthandColor()
    {
        var (_, priorities) = Build();
        Assert.Equal("#aabbcc", priorities.Create(Board, New("עדיפות", "#ABC")).Color);
    }

    [Fact]
    public void Create_RejectsANameAlreadyUsed_IncludingABuiltIn()
    {
        var (_, priorities) = Build();
        priorities.Create(Board, New("חוסם שחרור"));

        Assert.Throws<ArgumentException>(() => priorities.Create(Board, New("חוסם שחרור")));
        Assert.Throws<ArgumentException>(() => priorities.Create(Board, New("קריטית")));
    }

    [Fact]
    public void Apply_ABuiltIn_StoresOnlyTheLevel()
    {
        var (fixture, priorities) = Build();
        var item = fixture.Items.Get("i-u1")!;

        priorities.Apply(item, Board, "high");

        Assert.Equal(Priority.High, item.Priority);
        Assert.Null(item.PriorityId);
    }

    [Fact]
    public void Apply_ACustomPriority_StoresBothTheLevelAndTheIdentity()
    {
        var (fixture, priorities) = Build();
        var custom = priorities.Create(Board, New("חוסם שחרור", "#7C3AED", Priority.Critical));
        var item = fixture.Items.Get("i-u1")!;

        priorities.Apply(item, Board, custom.Id);

        Assert.Equal(Priority.Critical, item.Priority);
        Assert.Equal(custom.Id, item.PriorityId);
    }

    [Fact]
    public void Apply_RejectsAPriorityFromAnotherBoard()
    {
        var (fixture, priorities) = Build();
        var other = priorities.Create("b-u2", New("עדיפות של לוח אחר"));
        var item = fixture.Items.Get("i-u1")!;

        Assert.Throws<ArgumentException>(() => priorities.Apply(item, Board, other.Id));
    }

    [Fact]
    public void ChangingTheKind_MovesEveryItemOnThatPriorityToTheNewLevel()
    {
        var (fixture, priorities) = Build();
        var custom = priorities.Create(Board, New("חוסם שחרור", "#7C3AED", Priority.Low));
        var item = fixture.Items.Get("i-u1")!;
        priorities.Apply(item, Board, custom.Id);
        fixture.Items.Update(item);

        priorities.Update(Board, custom.Id, new UpdatePriorityRequest(null, null, Priority.Critical));

        var reloaded = fixture.Items.Get("i-u1")!;
        Assert.Equal(Priority.Critical, reloaded.Priority);
        Assert.Equal(custom.Id, reloaded.PriorityId);
    }

    [Fact]
    public void Delete_MovesItemsBackToTheBuiltInLevelTheyRankedAs()
    {
        var (fixture, priorities) = Build();
        var custom = priorities.Create(Board, New("חוסם שחרור", "#7C3AED", Priority.Critical));
        var item = fixture.Items.Get("i-u1")!;
        priorities.Apply(item, Board, custom.Id);
        fixture.Items.Update(item);

        priorities.Delete(Board, custom.Id);

        var reloaded = fixture.Items.Get("i-u1")!;
        Assert.Null(reloaded.PriorityId);
        Assert.Equal(Priority.Critical, reloaded.Priority);   // the level survives the name
        Assert.Equal(4, priorities.GetForBoard(Board).Count);
    }

    [Fact]
    public void Update_And_Delete_RefuseAPriorityFromAnotherBoard()
    {
        var (_, priorities) = Build();
        var other = priorities.Create("b-u2", New("עדיפות של לוח אחר"));

        Assert.Throws<KeyNotFoundException>(() => priorities.Update(Board, other.Id, new UpdatePriorityRequest("x", null, null)));
        Assert.Throws<KeyNotFoundException>(() => priorities.Delete(Board, other.Id));
    }

    [Fact]
    public void ItemService_Update_ByPriorityId_SetsBothFields()
    {
        var (fixture, priorities) = Build();
        var custom = priorities.Create(Board, New("חוסם שחרור", "#7C3AED", Priority.Critical));

        var result = fixture.ItemService.Update("u1", "i-u1",
            new UpdateItemRequest(null, null, null, null, null, null, null, custom.Id, null, null, null, null));

        Assert.NotNull(result);
        Assert.Equal(Priority.Critical, result!.Priority);
        Assert.Equal(custom.Id, result.PriorityId);
    }

    [Fact]
    public void ItemService_ClearPriority_RemovesBothTheLevelAndTheCustomPriority()
    {
        var (fixture, priorities) = Build();
        var custom = priorities.Create(Board, New("חוסם שחרור", "#7C3AED", Priority.Critical));
        fixture.ItemService.Update("u1", "i-u1",
            new UpdateItemRequest(null, null, null, null, null, null, null, custom.Id, null, null, null, null));

        var result = fixture.ItemService.Update("u1", "i-u1",
            new UpdateItemRequest(null, null, null, null, null, null, null, null, true, null, null, null));

        Assert.NotNull(result);
        Assert.Null(result!.Priority);
        Assert.Null(result.PriorityId);
    }

    [Fact]
    public void ItemService_ByPlainPriority_ClearsACustomPriority()
    {
        var (fixture, priorities) = Build();
        var custom = priorities.Create(Board, New("חוסם שחרור", "#7C3AED", Priority.Critical));
        fixture.ItemService.Update("u1", "i-u1",
            new UpdateItemRequest(null, null, null, null, null, null, null, custom.Id, null, null, null, null));

        var result = fixture.ItemService.Update("u1", "i-u1",
            new UpdateItemRequest(null, null, null, null, null, null, Priority.Low, null, null, null, null, null));

        Assert.NotNull(result);
        Assert.Equal(Priority.Low, result!.Priority);
        Assert.Null(result.PriorityId);
    }

    [Fact]
    public void BoardDetail_CarriesTheBoardsPriorities()
    {
        var (fixture, priorities) = Build();
        priorities.Create(Board, New("חוסם שחרור"));

        var detail = fixture.BoardService.GetBoard("u1", Board);

        Assert.NotNull(detail);
        Assert.Equal(5, detail!.Priorities.Count);
        Assert.Contains(detail.Priorities, p => p.Name == "חוסם שחרור" && !p.IsBuiltIn);
    }
}
