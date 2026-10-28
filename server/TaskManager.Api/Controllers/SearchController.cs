using Microsoft.AspNetCore.Mvc;
using TaskManager.Api.Auth;
using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Services;

namespace TaskManager.Api.Controllers;

[ApiController]
[Route("api")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
public sealed class SearchController(ISearchService search, ICurrentUser currentUser) : ControllerBase
{
    /// <summary>
    /// Searches boards, items and people the current user is allowed to see. A query shorter than
    /// two characters returns empty rather than everything.
    /// </summary>
    [HttpGet("search")]
    [ProducesResponseType<SearchResultsDto>(StatusCodes.Status200OK)]
    public ActionResult<SearchResultsDto> Search([FromQuery] string? q)
        => Ok(search.Search(currentUser.UserId, q ?? string.Empty));
}
