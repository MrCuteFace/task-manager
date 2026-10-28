using Microsoft.AspNetCore.Mvc;
using TaskManager.Api.Auth;
using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Services;

namespace TaskManager.Api.Controllers;

[ApiController]
[Route("api/dashboards")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
public sealed class DashboardsController(IDashboardService dashboards, ICurrentUser currentUser) : ControllerBase
{
    /// <summary>Dashboards visible to the current user: their own and those of everyone below them.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<DashboardSummaryDto>>(StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<DashboardSummaryDto>> GetVisible() =>
        Ok(dashboards.GetVisibleDashboards(currentUser.UserId));

    /// <summary>A dashboard's aggregated totals, per-assignee load and overdue items, over its visible source boards.</summary>
    [HttpGet("{id}")]
    [ProducesResponseType<DashboardDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<DashboardDetailDto> Get(string id)
    {
        var dashboard = dashboards.GetDashboard(currentUser.UserId, id);
        return dashboard is null
            ? Problem(statusCode: StatusCodes.Status404NotFound, title: "Dashboard not found", detail: $"No visible dashboard with id '{id}'.")
            : Ok(dashboard);
    }
}
