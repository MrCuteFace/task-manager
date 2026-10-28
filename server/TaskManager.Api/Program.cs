using System.Text.Json.Serialization;
using Microsoft.OpenApi.Models;
using TaskManager.Api.Auth;
using TaskManager.Api.Data;
using TaskManager.Api.Extensions;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Task Manager API",
        Version = "v1",
        Description = "Demo API. Log in via POST /api/auth/login, then use the returned token as a Bearer token.",
    });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        In = ParameterLocation.Header,
        Name = "Authorization",
        Description = "Paste the token returned by /api/auth/login.",
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } }] = [],
    });
});

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                     ?? ["http://localhost:5173"];
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy => policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddTaskManager();

var app = builder.Build();

// Demo data provider: fixed seed loaded into memory on every start (tech doc §3.1, §4.2).
app.Services.GetRequiredService<SeedDataLoader>().LoadFromFile(SeedDataLoader.DefaultPath);

app.UseSwagger();
app.UseSwaggerUI();

app.UseCors();
app.UseMiddleware<DemoAuthMiddleware>();
app.MapControllers();

app.Run();

/// <summary>Exposed so integration tests can host the app with WebApplicationFactory.</summary>
public partial class Program;
