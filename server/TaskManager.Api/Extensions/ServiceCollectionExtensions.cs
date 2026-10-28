using TaskManager.Api.Auth;
using TaskManager.Api.Data;
using TaskManager.Api.Repositories.Abstractions;
using TaskManager.Api.Repositories.InMemory;
using TaskManager.Api.Services;

namespace TaskManager.Api.Extensions;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Wires the layered architecture. Swapping the in-memory repositories for EF Core
    /// implementations is the only change needed here in a later phase.
    /// </summary>
    public static IServiceCollection AddTaskManager(this IServiceCollection services)
    {
        // Repositories (demo: in-memory singletons seeded at startup)
        services.AddSingleton<IUserRepository, InMemoryUserRepository>();
        services.AddSingleton<IWorkspaceRepository, InMemoryWorkspaceRepository>();
        services.AddSingleton<IBoardRepository, InMemoryBoardRepository>();
        services.AddSingleton<IGroupRepository, InMemoryGroupRepository>();
        services.AddSingleton<IBoardStatusRepository, InMemoryBoardStatusRepository>();
        services.AddSingleton<IBoardPriorityRepository, InMemoryBoardPriorityRepository>();
        services.AddSingleton<IItemRepository, InMemoryItemRepository>();
        services.AddSingleton<ISubItemRepository, InMemorySubItemRepository>();
        services.AddSingleton<IUpdateRepository, InMemoryUpdateRepository>();
        services.AddSingleton<IDashboardRepository, InMemoryDashboardRepository>();
        services.AddSingleton<IAttachmentRepository, InMemoryAttachmentRepository>();
        services.AddSingleton<SeedDataLoader>();

        // Auth (demo session store)
        services.AddHttpContextAccessor();
        services.AddSingleton<ISessionStore, InMemorySessionStore>();
        services.AddScoped<ICurrentUser, CurrentUserAccessor>();
        services.AddScoped<IAuthService, AuthService>();

        // Live events. The broker outlives any request - it holds the open streams - so it is a
        // singleton, and it therefore cannot take the scoped IVisibilityService. It gets its own
        // instance over the singleton user repository instead: VisibilityService is stateless, so a
        // long-lived one answers exactly as a per-request one does.
        services.AddSingleton<IBoardEventBroker>(sp =>
            new BoardEventBroker(new VisibilityService(sp.GetRequiredService<IUserRepository>())));

        // Business logic
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<IVisibilityService, VisibilityService>();
        services.AddScoped<IStatusService, StatusService>();
        services.AddScoped<IPriorityService, PriorityService>();
        services.AddScoped<BoardService>();
        services.AddScoped<IBoardService>(sp => sp.GetRequiredService<BoardService>());
        services.AddScoped<IItemService, ItemService>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<IDashboardService, DashboardService>();
        services.AddScoped<ISearchService, SearchService>();
        services.AddScoped<INotificationService, NotificationService>();

        return services;
    }
}
