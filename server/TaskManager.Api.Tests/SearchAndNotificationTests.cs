using TaskManager.Api.Models.Entities;
using TaskManager.Api.Services;
using TaskManager.Api.Tests.Fixtures;

namespace TaskManager.Api.Tests;

/// <summary>
/// Search and notifications both read across the whole data set, so the thing worth proving is that
/// they stop at the org tree exactly as the board and dashboard services do.
///
/// The fixture's org: u1 root; u2 and u4 report to u1; u3 reports to u2. Each owns one board with
/// one group and one item.
/// </summary>
public class SearchAndNotificationTests
{
    private const string Root = "u1";     // sees everyone
    private const string Manager = "u2";  // sees u2 and u3
    private const string Leaf = "u3";     // sees only u3
    private const string Sibling = "u4";  // the other branch under the root

    private static readonly DateTime Now = new(2026, 5, 10, 9, 0, 0, DateTimeKind.Utc);

    private static (ServiceTestFixture Fixture, SearchService Search, NotificationService Notifications) Build()
    {
        var clock = new FixedClock(Now);
        var fixture = new ServiceTestFixture(clock);
        return (
            fixture,
            new SearchService(fixture.Visibility, fixture.Users, fixture.Boards, fixture.Groups, fixture.Items),
            new NotificationService(
                fixture.Visibility, fixture.Users, fixture.Boards, fixture.Groups, fixture.Items, fixture.Updates, clock));
    }

    // ---- search -----------------------------------------------------------

    [Fact]
    public void Search_ShorterThanTwoCharacters_ReturnsNothing()
    {
        var (_, search, _) = Build();
        Assert.Equal(0, search.Search(Root, "u").Total);
        Assert.Equal(0, search.Search(Root, "").Total);
    }

    [Fact]
    public void Search_FindsOwnBoardAndItem()
    {
        var (_, search, _) = Build();
        var results = search.Search(Leaf, "u3");

        Assert.Contains(results.Boards, b => b.Id == "b-u3");
        Assert.Contains(results.Items, i => i.Id == "i-u3");
    }

    [Fact]
    public void Search_DoesNotLeakABoardFromAnUnrelatedBranch()
    {
        var (_, search, _) = Build();

        // The root can see u4's board; the leaf cannot.
        Assert.Contains(search.Search(Root, "Board u4").Boards, b => b.Id == "b-u4");
        Assert.Empty(search.Search(Leaf, "Board u4").Boards);
    }

    [Fact]
    public void Search_DoesNotLeakAnItemFromAnInvisibleBoard()
    {
        var (_, search, _) = Build();

        Assert.Contains(search.Search(Root, "Item u4").Items, i => i.Id == "i-u4");
        Assert.Empty(search.Search(Leaf, "Item u4").Items);
    }

    [Fact]
    public void Search_ReturnsOnlyVisiblePeople()
    {
        var (_, search, _) = Build();

        // The manager sees themselves and their report, never the sibling branch or the root.
        Assert.Single(search.Search(Manager, "Maya").People);
        Assert.Empty(search.Search(Manager, "Uri").People);
        Assert.Empty(search.Search(Manager, "Amit").People);
    }

    [Fact]
    public void Search_MatchesAPersonByEmail()
    {
        var (fixture, search, _) = Build();
        var maya = fixture.Users.Get(Leaf)!;
        maya.Email = "maya.sagi@example.com";
        fixture.Users.Update(maya);

        var results = search.Search(Manager, "maya.sagi@");
        Assert.Single(results.People);
        Assert.Equal(Leaf, results.People[0].Id);
    }

    [Fact]
    public void Search_CarriesTheBoardIdOnAnItemHit_ForNavigation()
    {
        var (_, search, _) = Build();
        var hit = Assert.Single(search.Search(Leaf, "Item u3").Items);
        Assert.Equal("b-u3", hit.BoardId);
    }

    // ---- notifications ----------------------------------------------------

    [Fact]
    public void Notifications_ReportsMyOverdueItem_ButNotOneAssignedToSomebodyElse()
    {
        var (fixture, _, notifications) = Build();

        var item = fixture.Items.Get("i-u4")!;
        item.AssigneeIds = [Sibling];
        item.DueDate = new DateOnly(2026, 5, 1);
        item.Status = ItemStatus.InProgress;
        fixture.Items.Update(item);

        Assert.Contains(notifications.GetForUser(Sibling), n => n.Kind == "overdue" && n.ItemId == "i-u4");

        // The root can see the board, but the work is not theirs, so it is not their alert.
        Assert.DoesNotContain(notifications.GetForUser(Root), n => n.Kind == "overdue");
    }

    [Fact]
    public void Notifications_DoesNotReportADoneItemAsOverdue()
    {
        var (fixture, _, notifications) = Build();

        var item = fixture.Items.Get("i-u4")!;
        item.AssigneeIds = [Sibling];
        item.DueDate = new DateOnly(2026, 5, 1);
        item.Status = ItemStatus.Done;
        fixture.Items.Update(item);

        Assert.DoesNotContain(notifications.GetForUser(Sibling), n => n.Kind == "overdue");
    }

    [Fact]
    public void Notifications_RanksOverdueAboveStuckAboveDueSoon()
    {
        var (fixture, _, notifications) = Build();

        var dueToday = fixture.Items.Get("i-u4")!;
        dueToday.AssigneeIds = [Sibling];
        dueToday.DueDate = DateOnly.FromDateTime(Now);
        dueToday.Status = ItemStatus.Stuck;
        fixture.Items.Update(dueToday);

        var feed = notifications.GetForUser(Sibling).ToList();
        var stuck = feed.FindIndex(n => n.Kind == "stuck");
        var dueSoon = feed.FindIndex(n => n.Kind == "due-soon");

        Assert.True(stuck >= 0 && dueSoon >= 0, "both kinds should be present");
        Assert.True(stuck < dueSoon, "stuck outranks due-soon");
    }

    [Fact]
    public void Notifications_ReportsAMentionByUsername_ButNotMyOwnUpdate()
    {
        var (fixture, _, notifications) = Build();

        fixture.Updates.Add(new Update
        {
            Id = "up-1", ItemId = "i-u3", AuthorUserId = Manager, Text = "שאלה ל-@maya בבקשה", CreatedAt = Now,
        });
        fixture.Updates.Add(new Update
        {
            Id = "up-2", ItemId = "i-u3", AuthorUserId = Leaf, Text = "@maya מזכירה לעצמי", CreatedAt = Now,
        });

        var feed = notifications.GetForUser(Leaf);
        var mentions = feed.Where(n => n.Kind == "mention").ToList();

        Assert.Single(mentions);
        Assert.Equal("i-u3", mentions[0].ItemId);
    }

    [Fact]
    public void Notifications_DoesNotReportAMentionOnAnInvisibleItem()
    {
        var (fixture, _, notifications) = Build();

        // An update on the sibling branch's item that names the leaf. The leaf cannot see that item,
        // so the mention must not reach them.
        fixture.Updates.Add(new Update
        {
            Id = "up-3", ItemId = "i-u4", AuthorUserId = Sibling, Text = "@maya תראי את זה", CreatedAt = Now,
        });

        Assert.DoesNotContain(notifications.GetForUser(Leaf), n => n.Kind == "mention");
    }

    [Fact]
    public void Notifications_ForAnUnknownUser_IsEmpty()
    {
        var (_, _, notifications) = Build();
        Assert.Empty(notifications.GetForUser("nobody"));
    }
}

/// <summary>A fixed clock, so "overdue" and "due today" mean the same thing on every machine.</summary>
internal sealed class FixedClock(DateTime utcNow) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => new(utcNow, TimeSpan.Zero);
}
