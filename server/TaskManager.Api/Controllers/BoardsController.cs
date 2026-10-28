using Microsoft.AspNetCore.Mvc;
using TaskManager.Api.Auth;
using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Services;

namespace TaskManager.Api.Controllers;

/// <summary>
/// Reference controller pattern: thin, delegates to a service that takes the current user's id
/// as its first argument, and maps a null result to 404 (hidden and missing look the same).
/// </summary>
[ApiController]
[Route("api/boards")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
public sealed class BoardsController(IBoardService boards, ICurrentUser currentUser) : ControllerBase
{
    /// <summary>Boards visible to the current user: their own and those of everyone below them.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<BoardSummaryDto>>(StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<BoardSummaryDto>> GetVisible() =>
        Ok(boards.GetVisibleBoards(currentUser.UserId));

    /// <summary>A board with its groups, items, subitems and updates.</summary>
    [HttpGet("{id}")]
    [ProducesResponseType<BoardDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<BoardDetailDto> Get(string id)
    {
        var board = boards.GetBoard(currentUser.UserId, id);
        return board is null ? BoardNotFound(id) : Ok(board);
    }

    /// <summary>Alias kept for the API contract in the technical design (GET /api/boards/{id}/items).</summary>
    [HttpGet("{id}/items")]
    [ProducesResponseType<BoardDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<BoardDetailDto> GetItems(string id) => Get(id);

    /// <summary>Adds an item to one of the board's groups.</summary>
    [HttpPost("{id}/items")]
    [ProducesResponseType<ItemDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<ItemDto> CreateItem(string id, [FromBody] CreateItemRequest request)
    {
        try
        {
            var item = boards.CreateItem(currentUser.UserId, id, request);
            return item is null
                ? BoardNotFound(id)
                : CreatedAtAction(nameof(ItemsController.Get), "Items", new { id = item.Id }, item);
        }
        catch (ArgumentException ex)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid item", detail: ex.Message);
        }
    }

    /// <summary>Adds a group (a section of items) at the end of the board.</summary>
    [HttpPost("{id}/groups")]
    [ProducesResponseType<GroupDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<GroupDto> CreateGroup(string id, [FromBody] CreateGroupRequest request)
    {
        try
        {
            var group = boards.CreateGroup(currentUser.UserId, id, request);
            return group is null ? BoardNotFound(id) : CreatedAtAction(nameof(Get), new { id }, group);
        }
        catch (ArgumentException ex)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid group", detail: ex.Message);
        }
    }

    private ObjectResult BoardNotFound(string id) =>
        Problem(statusCode: StatusCodes.Status404NotFound, title: "Board not found", detail: $"No visible board with id '{id}'.");
}
