using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Services;
using TaskManager.Api.Tests.Fixtures;

namespace TaskManager.Api.Tests;

/// <summary>The profile fields a user may change themselves, and the password rules around them.</summary>
public class UserProfileTests
{
    private static (ServiceTestFixture Fixture, UserService Users) Build()
    {
        var fixture = new ServiceTestFixture();
        return (fixture, new UserService(fixture.Visibility, fixture.Users));
    }

    private static UpdateProfileRequest Nothing => new(null, null, null, null, null, null);

    [Fact]
    public void UpdateProfile_SetsAValidEmail()
    {
        var (_, users) = Build();
        var result = users.UpdateProfile("u1", Nothing with { Email = "  amit.rozen@example.com " });
        Assert.Equal("amit.rozen@example.com", result.Email);
    }

    [Theory]
    [InlineData("not-an-email")]
    [InlineData("two@@at.com")]
    [InlineData("no@domain")]
    [InlineData("@nolocal.com")]
    [InlineData("spaces in@here.com")]
    public void UpdateProfile_RejectsAMalformedEmail(string email)
    {
        var (_, users) = Build();
        Assert.Throws<ArgumentException>(() => users.UpdateProfile("u1", Nothing with { Email = email }));
    }

    [Fact]
    public void UpdateProfile_ClearEmail_RemovesIt_AndWinsOverAValue()
    {
        var (_, users) = Build();
        users.UpdateProfile("u1", Nothing with { Email = "amit@example.com" });

        var cleared = users.UpdateProfile("u1", Nothing with { Email = "other@example.com", ClearEmail = true });
        Assert.Null(cleared.Email);
    }

    [Fact]
    public void UpdateProfile_BlankEmail_IsRejectedRatherThanTreatedAsClear()
    {
        // "" is almost always a bug in the caller; clearing has its own explicit flag.
        var (_, users) = Build();
        Assert.Throws<ArgumentException>(() => users.UpdateProfile("u1", Nothing with { Email = "   " }));
    }

    [Fact]
    public void ChangePassword_WithTheCorrectCurrentPassword_Succeeds()
    {
        var (fixture, users) = Build();
        users.ChangePassword("u1", new ChangePasswordRequest("demo123", "a-longer-secret"));
        Assert.Equal("a-longer-secret", fixture.Users.Get("u1")!.Password);
    }

    [Fact]
    public void ChangePassword_WithTheWrongCurrentPassword_Throws_AndLeavesItAlone()
    {
        var (fixture, users) = Build();
        Assert.Throws<UnauthorizedAccessException>(
            () => users.ChangePassword("u1", new ChangePasswordRequest("wrong", "a-longer-secret")));
        Assert.Equal("demo123", fixture.Users.Get("u1")!.Password);
    }

    [Fact]
    public void ChangePassword_RejectsAShortNewPassword()
    {
        var (_, users) = Build();
        Assert.Throws<ArgumentException>(
            () => users.ChangePassword("u1", new ChangePasswordRequest("demo123", "short12")));
    }

    [Fact]
    public void ChangePassword_RejectsReusingTheCurrentPassword()
    {
        var (_, users) = Build();
        // Long enough to pass the length rule, so this proves the sameness rule specifically.
        users.ChangePassword("u1", new ChangePasswordRequest("demo123", "first-password"));
        Assert.Throws<ArgumentException>(
            () => users.ChangePassword("u1", new ChangePasswordRequest("first-password", "first-password")));
    }

    [Fact]
    public void UpdateProfile_StillRejectsAShortName()
    {
        var (_, users) = Build();
        Assert.Throws<ArgumentException>(() => users.UpdateProfile("u1", Nothing with { FullName = "א" }));
    }
}
