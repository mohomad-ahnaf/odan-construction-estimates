import type { Prisma } from "@prisma/client";

type CodeKind = "client" | "project" | "estimate" | "clientEstimate";

/** PostgreSQL sequences allocate distinct values even when requests race. */
export async function nextCode(tx: Prisma.TransactionClient, kind: CodeKind) {
  const rows =
    kind === "client"
      ? await tx.$queryRaw<
          { value: bigint }[]
        >`SELECT nextval('odan_client_code_seq') AS value`
      : kind === "project"
        ? await tx.$queryRaw<
            { value: bigint }[]
          >`SELECT nextval('odan_project_code_seq') AS value`
        : kind === "estimate"
          ? await tx.$queryRaw<
              { value: bigint }[]
            >`SELECT nextval('odan_estimate_number_seq') AS value`
          : await tx.$queryRaw<
              { value: bigint }[]
            >`SELECT nextval('odan_client_estimate_number_seq') AS value`;
  const prefix = {
    client: "ODN-CLI",
    project: "ODN-PRJ",
    estimate: "ODN-EST",
    clientEstimate: "ODN-CE",
  }[kind];
  return `${prefix}-${String(rows[0].value).padStart(4, "0")}`;
}
