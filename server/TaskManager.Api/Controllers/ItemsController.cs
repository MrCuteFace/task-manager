using Microsoft.AspNetCore.Mvc;
using TaskManager.Api.Auth;
using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Services;

namespace TaskManager.Api.Controllers;

[ApiController]
[Route("api")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
public sealed class ItemsController(IItemService items, ICurrentUser currentUser) : ControllerBase
{
    [HttpGet("items/{id}")]
    [ProducesResponseType<ItemDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<ItemDto> Get(string id)
    {
        var item = items.Get(currentUser.UserId, id);
        return item is null ? ItemNotFound(id) : Ok(item);
    }

    /// <summary>Partial update of an item (status, title, assignees, due date, priority, notes, group, order).</summary>
    [HttpPatch("items/{id}")]
    [ProducesResponseType<ItemDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<ItemDto> Update(string id, [FromBody] UpdateItemRequest request)
    {
        try
        {
            var item = items.Update(currentUser.UserId, id, request);
            return item is null ? ItemNotFound(id) : Ok(item);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPatch("subitems/{id}")]
    [ProducesResponseType<SubItemDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<SubItemDto> UpdateSubItem(string id, [FromBody] UpdateSubItemRequest request)
    {
        try
        {
            var sub = items.UpdateSubItem(currentUser.UserId, id, request);
            return sub is null
                ? Problem(statusCode: StatusCodes.Status404NotFound, title: "Subitem not found", detail: $"No visible subitem with id '{id}'.")
                : Ok(sub);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    /// <summary>Posts an update (comment) on an item as the current user.</summary>
    [HttpPost("items/{id}/updates")]
    [ProducesResponseType<UpdateDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<UpdateDto> AddUpdate(string id, [FromBody] CreateUpdateRequest request)
    {
        try
        {
            var update = items.AddUpdate(currentUser.UserId, id, request);
            return update is null ? ItemNotFound(id) : CreatedAtAction(nameof(Get), new { id }, update);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    /// <summary>Attaches a file (multipart form field "file") to an item. Kept in memory; 10 MB max.</summary>
    [HttpPost("items/{id}/attachments")]
    [RequestSizeLimit(12 * 1024 * 1024)]
    [ProducesResponseType<AttachmentDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AttachmentDto>> AddAttachment(string id, IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
            return BadRequest("No file was sent.");
        if (file.Length > ItemService.MaxAttachmentBytes)
            return BadRequest("The file is larger than 10 MB.");

        using var stream = new MemoryStream((int)file.Length);
        await file.CopyToAsync(stream, cancellationToken);

        try
        {
            var attachment = items.AddAttachment(currentUser.UserId, id, file.FileName, file.ContentType, stream.ToArray());
            return attachment is null
                ? ItemNotFound(id)
                : CreatedAtAction(nameof(DownloadAttachment), new { id = attachment.Id }, attachment);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    /// <summary>Downloads an attachment the current user may see.</summary>
    [HttpGet("attachments/{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public IActionResult DownloadAttachment(string id)
    {
        var attachment = items.GetAttachment(currentUser.UserId, id);
        if (attachment is null)
            return Problem(statusCode: StatusCodes.Status404NotFound, title: "Attachment not found", detail: $"No visible attachment with id '{id}'.");
        return File(attachment.Data, attachment.ContentType, attachment.FileName);
    }

    [HttpDelete("attachments/{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public IActionResult DeleteAttachment(string id)
    {
        return items.RemoveAttachment(currentUser.UserId, id)
            ? NoContent()
            : Problem(statusCode: StatusCodes.Status404NotFound, title: "Attachment not found", detail: $"No visible attachment with id '{id}'.");
    }

    private ObjectResult ItemNotFound(string id) =>
        Problem(statusCode: StatusCodes.Status404NotFound, title: "Item not found", detail: $"No visible item with id '{id}'.");

    private ObjectResult BadRequest(string message) =>
        Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid request", detail: message);
}
