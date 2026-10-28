using System.Text.Json;
using System.Text.Json.Serialization;
using TaskManager.Api.Models.Entities;
using TaskManager.Api.Repositories.Abstractions;

namespace TaskManager.Api.Data;

/// <summary>Shape of <c>Data/seed-data.json</c>. Property names are camelCase in the file.</summary>
public sealed class SeedData
{
    public List<User> Users { get; set; } = [];
    public List<Workspace> Workspaces { get; set; } = [];
    public List<Board> Boards { get; set; } = [];
    public List<Group> Groups { get; set; } = [];
    public List<Item> Items { get; set; } = [];
    public List<SubItem> SubItems { get; set; } = [];
    public List<Update> Updates { get; set; } = [];
    public List<Dashboard> Dashboards { get; set; } = [];
    public List<SeedAttachment> Attachments { get; set; } = [];
}

/// <summary>An attachment in the seed file: the bytes are read from <c>Data/attachments/&lt;file&gt;</c> at startup.</summary>
public sealed class SeedAttachment : IEntity
{
    public required string Id { get; init; }
    public required string ItemId { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    /// <summary>File name inside Data/attachments.</summary>
    public required string File { get; set; }
    public required string UploadedByUserId { get; set; }
    public DateTime UploadedAt { get; set; }
}

/// <summary>
/// Loads the fixed demo data into the in-memory repositories on startup.
/// Validates referential integrity so a broken seed fails fast instead of producing empty screens.
/// </summary>
public sealed class SeedDataLoader(
    IUserRepository users,
    IWorkspaceRepository workspaces,
    IBoardRepository boards,
    IGroupRepository groups,
    IItemRepository items,
    ISubItemRepository subItems,
    IUpdateRepository updates,
    IDashboardRepository dashboards,
    IAttachmentRepository attachments,
    ILogger<SeedDataLoader> logger)
{
    public static string AttachmentsDirectory => Path.Combine(AppContext.BaseDirectory, "Data", "attachments");

    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    public static string DefaultPath => Path.Combine(AppContext.BaseDirectory, "Data", "seed-data.json");

    public void LoadFromFile(string path)
    {
        if (!File.Exists(path))
            throw new FileNotFoundException($"Seed data file not found at '{path}'.", path);

        var data = JsonSerializer.Deserialize<SeedData>(File.ReadAllText(path), JsonOptions)
                   ?? throw new InvalidOperationException("Seed data file is empty.");
        Load(data);
        logger.LogInformation("Seed data loaded from {Path}", path);
    }

    public void Load(SeedData data)
    {
        Validate(data);

        users.Clear();
        workspaces.Clear();
        boards.Clear();
        groups.Clear();
        items.Clear();
        subItems.Clear();
        updates.Clear();
        dashboards.Clear();
        attachments.Clear();

        data.Users.ForEach(users.Add);
        data.Workspaces.ForEach(workspaces.Add);
        data.Boards.ForEach(boards.Add);
        data.Groups.ForEach(groups.Add);
        data.Items.ForEach(items.Add);
        data.SubItems.ForEach(subItems.Add);
        data.Updates.ForEach(updates.Add);
        data.Dashboards.ForEach(dashboards.Add);

        foreach (var seed in data.Attachments)
        {
            var path = Path.Combine(AttachmentsDirectory, seed.File);
            if (!File.Exists(path))
            {
                logger.LogWarning("Seed attachment file missing, skipped: {Path}", path);
                continue;
            }
            attachments.Add(new Attachment
            {
                Id = seed.Id,
                ItemId = seed.ItemId,
                FileName = seed.FileName,
                ContentType = seed.ContentType,
                UploadedByUserId = seed.UploadedByUserId,
                UploadedAt = seed.UploadedAt,
                Data = File.ReadAllBytes(path),
            });
        }

        logger.LogInformation(
            "Seed: {Users} users, {Workspaces} workspaces, {Boards} boards, {Groups} groups, {Items} items, {SubItems} subitems, {Updates} updates, {Dashboards} dashboards",
            data.Users.Count, data.Workspaces.Count, data.Boards.Count, data.Groups.Count,
            data.Items.Count, data.SubItems.Count, data.Updates.Count, data.Dashboards.Count);
    }

    private static void Validate(SeedData data)
    {
        var errors = new List<string>();

        var userIds = Distinct(data.Users, "users", errors);
        var workspaceIds = Distinct(data.Workspaces, "workspaces", errors);
        var boardIds = Distinct(data.Boards, "boards", errors);
        var groupIds = Distinct(data.Groups, "groups", errors);
        var itemIds = Distinct(data.Items, "items", errors);
        Distinct(data.SubItems, "subItems", errors);
        Distinct(data.Updates, "updates", errors);
        Distinct(data.Dashboards, "dashboards", errors);

        var roots = data.Users.Count(u => u.ManagerId is null);
        if (data.Users.Count > 0 && roots != 1)
            errors.Add($"Expected exactly one root user (managerId = null), found {roots}.");

        foreach (var u in data.Users)
        {
            if (u.ManagerId is not null && !userIds.Contains(u.ManagerId))
                errors.Add($"User '{u.Id}' reports to unknown manager '{u.ManagerId}'.");
            if (u.ManagerId == u.Id)
                errors.Add($"User '{u.Id}' reports to themselves.");
        }

        var usernames = data.Users.Select(u => u.Username.ToLowerInvariant()).ToList();
        if (usernames.Distinct().Count() != usernames.Count)
            errors.Add("Usernames must be unique.");

        foreach (var b in data.Boards)
        {
            if (!workspaceIds.Contains(b.WorkspaceId)) errors.Add($"Board '{b.Id}' references unknown workspace '{b.WorkspaceId}'.");
            if (!userIds.Contains(b.OwnerUserId)) errors.Add($"Board '{b.Id}' references unknown owner '{b.OwnerUserId}'.");
        }

        foreach (var g in data.Groups)
            if (!boardIds.Contains(g.BoardId)) errors.Add($"Group '{g.Id}' references unknown board '{g.BoardId}'.");

        foreach (var i in data.Items)
        {
            if (!groupIds.Contains(i.GroupId)) errors.Add($"Item '{i.Id}' references unknown group '{i.GroupId}'.");
            foreach (var a in i.AssigneeIds.Where(a => !userIds.Contains(a)))
                errors.Add($"Item '{i.Id}' references unknown assignee '{a}'.");
        }

        foreach (var s in data.SubItems)
        {
            if (!itemIds.Contains(s.ItemId)) errors.Add($"SubItem '{s.Id}' references unknown item '{s.ItemId}'.");
            foreach (var a in s.AssigneeIds.Where(a => !userIds.Contains(a)))
                errors.Add($"SubItem '{s.Id}' references unknown assignee '{a}'.");
        }

        foreach (var u in data.Updates)
        {
            if (!itemIds.Contains(u.ItemId)) errors.Add($"Update '{u.Id}' references unknown item '{u.ItemId}'.");
            if (!userIds.Contains(u.AuthorUserId)) errors.Add($"Update '{u.Id}' references unknown author '{u.AuthorUserId}'.");
        }

        Distinct(data.Attachments, "attachments", errors);
        foreach (var a in data.Attachments)
        {
            if (!itemIds.Contains(a.ItemId)) errors.Add($"Attachment '{a.Id}' references unknown item '{a.ItemId}'.");
            if (!userIds.Contains(a.UploadedByUserId)) errors.Add($"Attachment '{a.Id}' references unknown user '{a.UploadedByUserId}'.");
        }

        foreach (var d in data.Dashboards)
        {
            if (!userIds.Contains(d.OwnerUserId)) errors.Add($"Dashboard '{d.Id}' references unknown owner '{d.OwnerUserId}'.");
            foreach (var b in d.SourceBoardIds.Where(b => !boardIds.Contains(b)))
                errors.Add($"Dashboard '{d.Id}' references unknown board '{b}'.");
        }

        if (errors.Count > 0)
            throw new InvalidOperationException("Seed data is invalid:\n - " + string.Join("\n - ", errors));
    }

    private static HashSet<string> Distinct<T>(IEnumerable<T> entities, string name, List<string> errors) where T : IEntity
    {
        var set = new HashSet<string>();
        foreach (var e in entities)
        {
            if (string.IsNullOrWhiteSpace(e.Id)) errors.Add($"An entry in '{name}' has an empty id.");
            else if (!set.Add(e.Id)) errors.Add($"Duplicate id '{e.Id}' in '{name}'.");
        }
        return set;
    }
}
