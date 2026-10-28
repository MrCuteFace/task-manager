using TaskManager.Api.Models.Dtos;
using TaskManager.Api.Models.Entities;
using TaskManager.Api.Repositories.Abstractions;

namespace TaskManager.Api.Services;

/// <summary>Item mutations. Every method resolves the item's board first and applies the visibility rule.</summary>
public interface IItemService
{
    ItemDto? Get(string viewerId, string itemId);
    ItemDto? Update(string viewerId, string itemId, UpdateItemRequest request);
    SubItemDto? UpdateSubItem(string viewerId, string subItemId, UpdateSubItemRequest request);
    UpdateDto? AddUpdate(string viewerId, string itemId, CreateUpdateRequest request);
    AttachmentDto? AddAttachment(string viewerId, string itemId, string fileName, string? contentType, byte[] data);
    /// <summary>The stored file, or null when it does not exist or its item is outside the viewer's scope.</summary>
    Attachment? GetAttachment(string viewerId, string attachmentId);
    bool RemoveAttachment(string viewerId, string attachmentId);
}

public sealed class ItemService(
    BoardService boardService,
    IGroupRepository groups,
    IItemRepository items,
    ISubItemRepository subItems,
    IUpdateRepository updates,
    IAttachmentRepository attachments,
    IStatusService statusService,
    IPriorityService priorityService,
    IUserRepository users,
    IBoardEventBroker events,
    TimeProvider clock) : IItemService
{
    public const long MaxAttachmentBytes = 10 * 1024 * 1024;

    public AttachmentDto? AddAttachment(string viewerId, string itemId, string fileName, string? contentType, byte[] data)
    {
        var found = FindVisibleItem(viewerId, itemId);
        if (found is null) return null;

        var name = Path.GetFileName(fileName ?? string.Empty).Trim();
        if (name.Length == 0) throw new ArgumentException("File name is required.", nameof(fileName));
        if (data.Length == 0) throw new ArgumentException("The file is empty.", nameof(data));
        if (data.LongLength > MaxAttachmentBytes) throw new ArgumentException("The file is larger than 10 MB.", nameof(data));

        var attachment = new Attachment
        {
            Id = BoardService.NewId("att"),
            ItemId = itemId,
            FileName = name,
            ContentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType,
            UploadedByUserId = viewerId,
            UploadedAt = clock.GetUtcNow().UtcDateTime,
            Data = data,
        };
        attachments.Add(attachment);
        return boardService.ToAttachmentDto(attachment);
    }

    public Attachment? GetAttachment(string viewerId, string attachmentId)
    {
        var attachment = attachments.Get(attachmentId);
        if (attachment is null) return null;
        return FindVisibleItem(viewerId, attachment.ItemId) is null ? null : attachment;
    }

    public bool RemoveAttachment(string viewerId, string attachmentId)
    {
        var attachment = GetAttachment(viewerId, attachmentId);
        if (attachment is null) return false;
        attachments.Remove(attachment.Id);
        return true;
    }

    public ItemDto? Get(string viewerId, string itemId)
    {
        var found = FindVisibleItem(viewerId, itemId);
        return found is null ? null : boardService.ToItemDto(found.Value.Item, found.Value.Board.Id);
    }

    public ItemDto? Update(string viewerId, string itemId, UpdateItemRequest request)
    {
        var found = FindVisibleItem(viewerId, itemId);
        if (found is null) return null;
        var (item, board) = found.Value;

        if (request.Title is not null)
        {
            var title = request.Title.Trim();
            if (title.Length == 0) throw new ArgumentException("Title cannot be empty.", nameof(request));
            item.Title = title;
        }
        // StatusId wins: it carries the meaning as well as the identity, so a caller that sends both
        // cannot end up with a custom status whose kind contradicts the Status field.
        if (!string.IsNullOrWhiteSpace(request.StatusId))
        {
            statusService.Apply(item, board.Id, request.StatusId);
        }
        else if (request.Status is { } status)
        {
            item.Status = status;
            item.StatusId = null;
        }
        if (request.AssigneeIds is not null)
        {
            var unknown = request.AssigneeIds.FirstOrDefault(a => users.Get(a) is null);
            if (unknown is not null) throw new ArgumentException($"Unknown assignee '{unknown}'.", nameof(request));
            item.AssigneeIds = request.AssigneeIds.Distinct().ToList();
        }
        if (request.ClearDueDate == true) item.DueDate = null;
        else if (request.DueDate is { } due) item.DueDate = due;
        // Clearing wins over both; then a priority id wins over a bare level, for the same reason a
        // status id does: it carries the level as well as the identity.
        if (request.ClearPriority == true)
        {
            item.Priority = null;
            item.PriorityId = null;
        }
        else if (!string.IsNullOrWhiteSpace(request.PriorityId))
        {
            priorityService.Apply(item, board.Id, request.PriorityId);
        }
        else if (request.Priority is { } priority)
        {
            item.Priority = priority;
            item.PriorityId = null;
        }
        if (request.Notes is not null) item.Notes = request.Notes;
        var targetGroupId = item.GroupId;
        if (request.GroupId is not null && request.GroupId != item.GroupId)
        {
            var target = groups.Get(request.GroupId);
            if (target is null || target.BoardId != board.Id)
                throw new ArgumentException($"Group '{request.GroupId}' does not belong to this board.", nameof(request));
            targetGroupId = target.Id;
        }

        if (targetGroupId != item.GroupId || request.Order is not null)
            Reorder(item, targetGroupId, request.Order);

        items.Update(item);
        return boardService.ToItemDto(item, board.Id);
    }

    public SubItemDto? UpdateSubItem(string viewerId, string subItemId, UpdateSubItemRequest request)
    {
        var sub = subItems.Get(subItemId);
        if (sub is null) return null;
        var found = FindVisibleItem(viewerId, sub.ItemId);
        if (found is null) return null;

        if (request.Title is not null)
        {
            var title = request.Title.Trim();
            if (title.Length == 0) throw new ArgumentException("Title cannot be empty.", nameof(request));
            sub.Title = title;
        }
        if (request.Status is { } status) sub.Status = status;
        if (request.AssigneeIds is not null) sub.AssigneeIds = request.AssigneeIds.Distinct().ToList();

        subItems.Update(sub);
        return boardService.ToSubItemDto(sub);
    }

    public UpdateDto? AddUpdate(string viewerId, string itemId, CreateUpdateRequest request)
    {
        var found = FindVisibleItem(viewerId, itemId);
        if (found is null) return null;

        var text = request.Text.Trim();
        if (text.Length == 0) throw new ArgumentException("Update text is required.", nameof(request));

        // A reply must answer an update on this same item: the parent id arrives from the client, and
        // without this a comment could be hung off a thread on an item the author cannot even see.
        var parentId = string.IsNullOrWhiteSpace(request.ParentUpdateId) ? null : request.ParentUpdateId.Trim();
        if (parentId is not null)
        {
            var parent = updates.Get(parentId);
            if (parent is null || parent.ItemId != itemId)
                throw new ArgumentException("The update being replied to does not exist on this item.", nameof(request));
        }

        var update = new Update
        {
            Id = BoardService.NewId("upd"),
            ItemId = itemId,
            AuthorUserId = viewerId,
            Text = text,
            CreatedAt = clock.GetUtcNow().UtcDateTime,
            ParentUpdateId = parentId,
        };
        updates.Add(update);

        var dto = boardService.ToUpdateDto(update);
        // Everyone whose org tree reaches this board and has a tab open sees the comment appear.
        events.Publish(
            found.Value.Board.OwnerUserId,
            new BoardEventDto(BoardEventDto.UpdateCreated, found.Value.Board.Id, itemId, dto));
        return dto;
    }

    /// <summary>
    /// Moves the item to <paramref name="targetGroupId"/> at index <paramref name="index"/> (end when null)
    /// and renumbers both the source and the target group so orders stay dense from zero.
    /// </summary>
    private void Reorder(Item item, string targetGroupId, int? index)
    {
        var sourceGroupId = item.GroupId;
        var source = items.GetByGroupId(sourceGroupId).Where(i => i.Id != item.Id).ToList();
        var target = sourceGroupId == targetGroupId ? source : items.GetByGroupId(targetGroupId).ToList();

        var at = Math.Clamp(index ?? target.Count, 0, target.Count);
        target.Insert(at, item);
        item.GroupId = targetGroupId;

        for (var i = 0; i < target.Count; i++)
        {
            if (target[i].Order == i && target[i].Id != item.Id) continue;
            target[i].Order = i;
            if (target[i].Id != item.Id) items.Update(target[i]);
        }
        if (sourceGroupId != targetGroupId)
        {
            for (var i = 0; i < source.Count; i++)
            {
                if (source[i].Order == i) continue;
                source[i].Order = i;
                items.Update(source[i]);
            }
        }
    }

    private (Item Item, Board Board)? FindVisibleItem(string viewerId, string itemId)
    {
        var item = items.Get(itemId);
        if (item is null) return null;
        var group = groups.Get(item.GroupId);
        if (group is null) return null;
        var board = boardService.FindVisibleBoard(viewerId, group.BoardId);
        return board is null ? null : (item, board);
    }
}
