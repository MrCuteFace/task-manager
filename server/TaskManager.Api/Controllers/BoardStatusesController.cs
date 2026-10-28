using Microsoft.AspNetCore.Mvc;
using TaskManager.Api.Auth;
using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Services;

namespace TaskManager.Api.Controllers;

/// <summary>
/// A board's own statuses. The four built-ins are returned with the board and cannot be edited or
/// removed here; only statuses a board has invented for itself are writable.
///
/// Every route re-checks the board through <see cref="IBoardService"/>, so a board outside the
/// caller's org scope is a 404 exactly as it is everywhere else.
/// </summary>
[ApiController]
[Route("api/boards/{boardId}/statuses")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
public sealed class BoardStatusesController(
    IStatusService statuses,
    IBoardService boards,
    ICurrentUser currentUser) : ControllerBase
{
    private bool CanSeeBoard(string boardId) => boards.GetBoard(currentUser.UserId, boardId) is not null;

    /// <summary>Every status this board offers: the four built-ins, then its own.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<StatusOptionDto>>(StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<StatusOptionDto>> Get(string boardId)
    {
        if (!CanSeeBoard(boardId)) return NotFound();
        return Ok(statuses.GetForBoard(boardId));
    }

    /// <summary>Adds a status with its own name, color and meaning.</summary>
    [HttpPost]
    [ProducesResponseType<StatusOptionDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public ActionResult<StatusOptionDto> Create(string boardId, [FromBody] CreateStatusRequest request)
    {
        if (!CanSeeBoard(boardId)) return NotFound();
        try
        {
            var created = statuses.Create(boardId, request);
            var dto = new StatusOptionDto(created.Id, created.Name, created.Color, created.Kind, false);
            return CreatedAtAction(nameof(Get), new { boardId }, dto);
        }
        catch (ArgumentException ex)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid status", detail: ex.Message);
        }
    }

    /// <summary>Renames, recolors, or changes the meaning of one of the board's own statuses.</summary>
    [HttpPatch("{statusId}")]
    [ProducesResponseType<StatusOptionDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public ActionResult<StatusOptionDto> Update(string boardId, string statusId, [FromBody] UpdateStatusRequest request)
    {
        if (!CanSeeBoard(boardId)) return NotFound();
        try
        {
            var updated = statuses.Update(boardId, statusId, request);
            return Ok(new StatusOptionDto(updated.Id, updated.Name, updated.Color, updated.Kind, false));
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (ArgumentException ex)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid status", detail: ex.Message);
        }
    }

    /// <summary>
    /// Removes one of the board's own statuses. Items on it fall back to the built-in matching its
    /// meaning, so nothing is left pointing at a status that no longer exists.
    /// </summary>
    [HttpDelete("{statusId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public IActionResult Delete(string boardId, string statusId)
    {
        if (!CanSeeBoard(boardId)) return NotFound();
        try
        {
            statuses.Delete(boardId, statusId);
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
    }
}
