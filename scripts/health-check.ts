import { healthCheckerService } from "../src/infrastructure/container";
import { prisma } from "../src/infrastructure/database/prismaClient";

async function runCliHealthCheck() {
  console.log("==============================================================");
  console.log("🔍 PILOTO - HEALTH CHECKER CLI (Auditoría de Enlaces Mirror)");
  console.log("==============================================================");

  const batchSize = Number(process.argv[2] || "50");
  const delayMs = Number(process.argv[3] || "200");

  console.log(`⏳ Verificando hasta ${batchSize} mirrors (Rate limit: ${delayMs}ms entre peticiones)...\n`);

  const report = await healthCheckerService.runBatchHealthCheck(batchSize, delayMs);

  for (const item of report.details) {
    const icon =
      item.newStatus === "ACTIVE"
        ? "✅"
        : item.newStatus === "UNDER_REVIEW"
        ? "⚠️"
        : "❌";

    console.log(
      `${icon} [${item.serverName}] HTTP ${item.httpStatus} (${item.responseTimeMs}ms) | ` +
        `Estado: ${item.previousStatus} -> ${item.newStatus} | ` +
        `Fallos: ${item.consecutiveFailures}/3 | ` +
        `Película disponible: ${item.movieStillAvailable ? "SÍ" : "NO (Soft Delete)"}`
    );
  }

  console.log("\n--------------------------------------------------------------");
  console.log(`📊 RESUMEN DE AUDITORÍA (${report.timestamp}):`);
  console.log(`   • Total verificados : ${report.totalChecked}`);
  console.log(`   • Activos (ACTIVE)  : ${report.aliveCount}`);
  console.log(`   • En revisión       : ${report.underReviewCount}`);
  console.log(`   • Caídos (DOWN)     : ${report.downCount}`);
  console.log(`   • Películas ocultas : ${report.moviesDisabledCount}`);
  console.log("==============================================================");
}

runCliHealthCheck()
  .catch((err) => {
    console.error("❌ Error en la ejecución del Health Checker:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
