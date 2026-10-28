using TaskManager.Api.Models.Entities;
using TaskManager.Api.Repositories.InMemory;
using TaskManager.Api.Services;

namespace TaskManager.Api.Tests;

public class VisibilityServiceTests
{
    private static InMemoryUserRepository BuildFiveLevelTree()
    {
        var users = new InMemoryUserRepository();
        users.Add(new User { Id = "u1", FullName = "U1", Title = "T", ManagerId = null, Username = "u1", Password = "x" });
        users.Add(new User { Id = "u2", FullName = "U2", Title = "T", ManagerId = "u1", Username = "u2", Password = "x" });
        users.Add(new User { Id = "u3", FullName = "U3", Title = "T", ManagerId = "u2", Username = "u3", Password = "x" });
        users.Add(new User { Id = "u4", FullName = "U4", Title = "T", ManagerId = "u1", Username = "u4", Password = "x" });
        users.Add(new User { Id = "u5", FullName = "U5", Title = "T", ManagerId = "u3", Username = "u5", Password = "x" });
        return users;
    }

    [Theory]
    [InlineData("u1", new[] { "u1", "u2", "u3", "u4", "u5" })]
    [InlineData("u2", new[] { "u2", "u3", "u5" })]
    [InlineData("u3", new[] { "u3", "u5" })]
    [InlineData("u4", new[] { "u4" })]
    [InlineData("u5", new[] { "u5" })]
    public void GetVisibleUserIds_ReturnsSelfAndAllDescendants(string viewerId, string[] expected)
    {
        var service = new VisibilityService(BuildFiveLevelTree());

        var visible = service.GetVisibleUserIds(viewerId);

        Assert.Equal(expected.ToHashSet(), visible);
    }

    [Fact]
    public void GetVisibleUserIds_UnknownViewer_ReturnsEmptySet()
    {
        var service = new VisibilityService(BuildFiveLevelTree());

        var visible = service.GetVisibleUserIds("unknown");

        Assert.Empty(visible);
    }

    [Fact]
    public void CanSee_Upward_IsFalse()
    {
        var service = new VisibilityService(BuildFiveLevelTree());

        Assert.False(service.CanSee("u2", "u1"));
    }

    [Fact]
    public void CanSee_Sideways_IsFalse()
    {
        var service = new VisibilityService(BuildFiveLevelTree());

        Assert.False(service.CanSee("u2", "u4"));
    }

    [Fact]
    public void CanSee_IndirectDescendant_IsTrue()
    {
        var service = new VisibilityService(BuildFiveLevelTree());

        Assert.True(service.CanSee("u1", "u5"));
    }

    [Fact]
    public void GetVisibleUserIds_CycleInManagerGraph_DoesNotHangAndIncludesBothMembers()
    {
        var users = new InMemoryUserRepository();
        users.Add(new User { Id = "a", FullName = "A", Title = "T", ManagerId = "b", Username = "a", Password = "x" });
        users.Add(new User { Id = "b", FullName = "B", Title = "T", ManagerId = "a", Username = "b", Password = "x" });
        var service = new VisibilityService(users);

        var visible = service.GetVisibleUserIds("a");

        Assert.Contains("a", visible);
        Assert.Contains("b", visible);
    }
}
