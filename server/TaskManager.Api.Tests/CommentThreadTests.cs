using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Services;
using TaskManager.Api.Tests.Fixtures;

namespace TaskManager.Api.Tests;

/// <summary>
/// Threaded comments and the live channel that carries them. The org tree (u1 root; u2 and u4 report to
/// u1; u3 reports to u2) is the fixture's, so u4 is the parallel manager who must never see u2's board.
/// </summary>
public class CommentThreadTests
{
    // ---- Threading ---------------------------------------------------------

    [Fact]
    public void AddUpdate_WithoutParent_OpensAThread()
    {
        var fx = new ServiceTestFixture();

        var update = fx.ItemService.AddUpdate("u1", fx.ItemIdFor["u1"], new CreateUpdateRequest("ראשון"));

        Assert.NotNull(update);
        Assert.Null(update!.ParentUpdateId);
        Assert.Null(update.ParentAuthorName);
    }

    [Fact]
    public void AddUpdate_WithParent_IsAReplyAndNamesWhoItAnswers()
    {
        var fx = new ServiceTestFixture();
        var itemId = fx.ItemIdFor["u2"];
        var root = fx.ItemService.AddUpdate("u2", itemId, new CreateUpdateRequest("שאלה"))!;

        var reply = fx.ItemService.AddUpdate("u1", itemId, new CreateUpdateRequest("תשובה", root.Id));

        Assert.NotNull(reply);
        Assert.Equal(root.Id, reply!.ParentUpdateId);
        Assert.Equal("Yossi Levi", reply.ParentAuthorName);
        Assert.Equal("Amit Rozen", reply.AuthorName);
    }

    [Fact]
    public void AddUpdate_ReplyToAReply_IsAllowed()
    {
        var fx = new ServiceTestFixture();
        var itemId = fx.ItemIdFor["u1"];
        var root = fx.ItemService.AddUpdate("u1", itemId, new CreateUpdateRequest("ראשון"))!;
        var reply = fx.ItemService.AddUpdate("u1", itemId, new CreateUpdateRequest("שני", root.Id))!;

        var replyToReply = fx.ItemService.AddUpdate("u1", itemId, new CreateUpdateRequest("שלישי", reply.Id));

        Assert.NotNull(replyToReply);
        Assert.Equal(reply.Id, replyToReply!.ParentUpdateId);
    }

    [Fact]
    public void AddUpdate_ParentOnAnotherItem_Throws()
    {
        var fx = new ServiceTestFixture();
        var elsewhere = fx.ItemService.AddUpdate("u1", fx.ItemIdFor["u1"], new CreateUpdateRequest("במקום אחר"))!;

        Assert.Throws<ArgumentException>(() =>
            fx.ItemService.AddUpdate("u1", fx.ItemIdFor["u2"], new CreateUpdateRequest("תגובה", elsewhere.Id)));
    }

    [Fact]
    public void AddUpdate_UnknownParent_Throws()
    {
        var fx = new ServiceTestFixture();

        Assert.Throws<ArgumentException>(() =>
            fx.ItemService.AddUpdate("u1", fx.ItemIdFor["u1"], new CreateUpdateRequest("תגובה", "upd-nope")));
    }

    [Fact]
    public void AddUpdate_OutsideTheViewersScope_ReturnsNull()
    {
        var fx = new ServiceTestFixture();

        // u4 is a parallel manager: u2's item is not theirs to comment on.
        var result = fx.ItemService.AddUpdate("u4", fx.ItemIdFor["u2"], new CreateUpdateRequest("שלום"));

        Assert.Null(result);
    }

    [Fact]
    public void ItemDto_CarriesTheThreadBack()
    {
        var fx = new ServiceTestFixture();
        var itemId = fx.ItemIdFor["u3"];
        var root = fx.ItemService.AddUpdate("u3", itemId, new CreateUpdateRequest("ראשון"))!;
        fx.ItemService.AddUpdate("u2", itemId, new CreateUpdateRequest("תגובה", root.Id));

        var item = fx.ItemService.Get("u1", itemId);

        Assert.NotNull(item);
        Assert.Equal(2, item!.Updates.Count);
        Assert.Null(item.Updates[0].ParentUpdateId);
        Assert.Equal(root.Id, item.Updates[1].ParentUpdateId);
        Assert.Equal("Maya Sagi", item.Updates[1].ParentAuthorName);
    }

    // ---- The live channel --------------------------------------------------

    [Fact]
    public async Task Comment_ReachesASubscriberWhoCanSeeTheBoard()
    {
        var fx = new ServiceTestFixture();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        // u1 is above u2, so u2's board is in u1's subtree.
        var received = ReadFirstAsync(fx.Events, "u1", cts.Token);
        await WaitForSubscriberAsync(fx.Events, cts.Token);

        var posted = fx.ItemService.AddUpdate("u2", fx.ItemIdFor["u2"], new CreateUpdateRequest("חדש"))!;

        var e = await received;
        Assert.Equal(BoardEventDto.UpdateCreated, e.Type);
        Assert.Equal(fx.BoardIdFor["u2"], e.BoardId);
        Assert.Equal(fx.ItemIdFor["u2"], e.ItemId);
        Assert.Equal(posted.Id, e.Update!.Id);
    }

    [Fact]
    public async Task Comment_DoesNotReachAParallelManager()
    {
        var fx = new ServiceTestFixture();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        // u4 is a parallel manager of u2: nothing on u2's board is theirs to see, live or otherwise.
        var received = ReadFirstAsync(fx.Events, "u4", cts.Token);
        await WaitForSubscriberAsync(fx.Events, cts.Token);

        fx.ItemService.AddUpdate("u2", fx.ItemIdFor["u2"], new CreateUpdateRequest("סודי"));
        // ... and one on u4's own board, so the wait ends on a real event rather than a timeout.
        var own = fx.ItemService.AddUpdate("u4", fx.ItemIdFor["u4"], new CreateUpdateRequest("שלי"))!;

        var e = await received;
        Assert.Equal(own.Id, e.Update!.Id);
        Assert.Equal(fx.BoardIdFor["u4"], e.BoardId);
    }

    [Fact]
    public async Task Comment_DoesNotReachAManagerAbove()
    {
        var fx = new ServiceTestFixture();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        // u3 sees only themselves: their own manager's board is not visible to them.
        var received = ReadFirstAsync(fx.Events, "u3", cts.Token);
        await WaitForSubscriberAsync(fx.Events, cts.Token);

        fx.ItemService.AddUpdate("u2", fx.ItemIdFor["u2"], new CreateUpdateRequest("של המנהל"));
        var own = fx.ItemService.AddUpdate("u3", fx.ItemIdFor["u3"], new CreateUpdateRequest("שלי"))!;

        var e = await received;
        Assert.Equal(own.Id, e.Update!.Id);
    }

    [Fact]
    public async Task Subscriber_IsForgottenWhenItsStreamEnds()
    {
        var fx = new ServiceTestFixture();
        using var outer = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        using var cts = new CancellationTokenSource();

        var stream = Task.Run(async () =>
        {
            await foreach (var _ in fx.Events.Subscribe("u1", cts.Token)) { }
        }, outer.Token);

        await WaitForSubscriberAsync(fx.Events, outer.Token);
        Assert.Equal(1, fx.Events.SubscriberCount);

        await cts.CancelAsync();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => stream);

        Assert.Equal(0, fx.Events.SubscriberCount);
    }

    private static Task<BoardEventDto> ReadFirstAsync(IBoardEventBroker broker, string userId, CancellationToken ct) =>
        Task.Run(async () =>
        {
            await foreach (var e in broker.Subscribe(userId, ct)) return e;
            throw new InvalidOperationException("The stream ended without an event.");
        }, ct);

    /// <summary>Subscribe() registers inside the async iterator, so a publish before it lands is lost.</summary>
    private static async Task WaitForSubscriberAsync(IBoardEventBroker broker, CancellationToken ct)
    {
        while (broker.SubscriberCount == 0)
            await Task.Delay(10, ct);
    }
}
