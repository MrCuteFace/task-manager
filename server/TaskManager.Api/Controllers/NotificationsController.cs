using Microsoft.AspNetCore.Mvc;
using TaskManager.Api.Auth;
using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Services;

namespace TaskManager.Api.Controllers;

[ApiController]
[Route("api")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
public sealed class NotificationsController(INotificationService notifications, ICurrentUser currentUser) : ControllerBase
{
    /// <summary>
    /// What needs the current user's attention, derived from the items they can see: their overdue
    /// work, anything of theirs marked stuck, what is due today or tomorrow, and updates that tag
    /// them. Read state is kept by the client, so there is no matching write endpoint.
    /// </summary>
    [HttpGet("notifications")]
    [ProducesResponseType<IReadOnlyList<NotificationDto>>(StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<NotificationDto>> Get()
        => Ok(notifications.GetForUser(currentUser.UserId));
}
