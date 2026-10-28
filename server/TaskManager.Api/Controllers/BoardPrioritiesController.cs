using Microsoft.AspNetCore.Mvc;
using TaskManager.Api.Auth;
using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Services;

namespace TaskManager.Api.Controllers;

/// <summary>
/// A board's own priorities. The four built-in levels are returned with the board and cannot be
/// edited or removed here. Mirrors <see cref="BoardStatusesController"/>.
/// </summary>
[ApiController]
[Route("api/boards/{boardId}/priorities")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
public sealed class BoardPrioritiesController(
    IPriorityService priorities,
    IBoardService boards,
    ICurrentUser currentUser) : ControllerBase
{
    private bool CanSeeBoard(string boardId) => boards.GetBoard(currentUser.UserId, boardId) is not null;

    /// <summary>Every priority this board offers: the four built-in levels, then its own.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<PriorityOptionDto>>(StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<PriorityOptionDto>> Get(string boardId)
    {
        if (!CanSeeBoard(boardId)) return NotFound();
        return Ok(priorities.GetForBoard(boardId));
    }

    /// <summary>Adds a priority with its own name, color and level.</summary>
    [HttpPost]
    [ProducesResponseType<PriorityOptionDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public ActionResult<PriorityOptionDto> Create(string boardId, [FromBody] CreatePriorityRequest request)
    {
        if (!CanSeeBoard(boardId)) return NotFound();
        try
        {
            var created = priorities.Create(boardId, request);
            var dto = new PriorityOptionDto(created.Id, created.Name, created.Color, created.Kind, false);
            return CreatedAtAction(nameof(Get), new { boardId }, dto);
        }
        catch (ArgumentException ex)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid priority", detail: ex.Message);
        }
    }

    /// <summary>Renames, recolors, or re-levels one of the board's own priorities.</summary>
    [HttpPatch("{priorityId}")]
    [ProducesResponseType<PriorityOptionDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public ActionResult<PriorityOptionDto> Update(string boardId, string priorityId, [FromBody] UpdatePriorityRequest request)
    {
        if (!CanSeeBoard(boardId)) return NotFound();
        try
        {
            var updated = priorities.Update(boardId, priorityId, request);
            return Ok(new PriorityOptionDto(updated.Id, updated.Name, updated.Color, updated.Kind, false));
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (ArgumentException ex)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid priority", detail: ex.Message);
        }
    }

    /// <summary>
    /// Removes one of the board's own priorities. Items on it fall back to the built-in level they
    /// already ranked as.
    /// </summary>
    [HttpDelete("{priorityId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public IActionResult Delete(string boardId, string priorityId)
    {
        if (!CanSeeBoard(boardId)) return NotFound();
        try
        {
            priorities.Delete(boardId, priorityId);
            return NoContent();
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
    }
}
