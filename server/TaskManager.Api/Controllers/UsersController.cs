using Microsoft.AspNetCore.Mvc;
using TaskManager.Api.Auth;
using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Services;

namespace TaskManager.Api.Controllers;

[ApiController]
[Route("api")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
public sealed class UsersController(IUserService users, ICurrentUser currentUser) : ControllerBase
{
    /// <summary>The current user.</summary>
    [HttpGet("users/me")]
    [ProducesResponseType<UserDto>(StatusCodes.Status200OK)]
    public ActionResult<UserDto> GetMe() => Ok(UserDto.From(currentUser.User));

    /// <summary>Edits the current user's name, title or profile photo.</summary>
    [HttpPatch("users/me")]
    [ProducesResponseType<UserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public ActionResult<UserDto> UpdateMe([FromBody] UpdateProfileRequest request)
    {
        try
        {
            return Ok(users.UpdateProfile(currentUser.UserId, request));
        }
        catch (ArgumentException ex)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid profile", detail: ex.Message);
        }
    }

    /// <summary>Changes the current user's password. The current password must match.</summary>
    [HttpPost("users/me/password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public IActionResult ChangePassword([FromBody] ChangePasswordRequest request)
    {
        try
        {
            users.ChangePassword(currentUser.UserId, request);
            return NoContent();
        }
        catch (UnauthorizedAccessException ex)
        {
            // 403, not 401: the caller is authenticated, they just got the current password wrong.
            // A 401 would make the client treat the session as expired and bounce them to login.
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "Wrong password", detail: ex.Message);
        }
        catch (ArgumentException ex)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid password", detail: ex.Message);
        }
    }

    /// <summary>Users visible to the current user: themselves and everyone below them. Feeds assignee pickers.</summary>
    [HttpGet("users")]
    [ProducesResponseType<IReadOnlyList<UserDto>>(StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<UserDto>> GetVisible() => Ok(users.GetVisibleUsers(currentUser.UserId));

    /// <summary>The full organization tree, with each node marked visible/not for the current user.</summary>
    [HttpGet("org-tree")]
    [ProducesResponseType<OrgNodeDto>(StatusCodes.Status200OK)]
    public ActionResult<OrgNodeDto> GetOrgTree() => Ok(users.GetOrgTree(currentUser.UserId));
}
