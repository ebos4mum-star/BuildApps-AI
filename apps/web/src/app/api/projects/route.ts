import { createUserProject, listUserProjects } from "@buildapps/server";
import { getStores } from "@/lib/backend";
import { handle, json, readJson } from "@/lib/http";

export const GET = (req: Request) =>
  handle(req, async (userId) =>
    json({ projects: await listUserProjects(getStores().projects, userId) }),
  );
export const POST = (req: Request) =>
  handle(req, async (userId) =>
    json(
      {
        project: await createUserProject(
          getStores().projects,
          userId,
          (await readJson(req)) as never,
        ),
      },
      201,
    ),
  );
