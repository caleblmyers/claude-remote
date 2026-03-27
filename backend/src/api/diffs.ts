import { Router, Request, Response } from "express";
import * as db from "../db";

const router: Router = Router();

router.get("/tasks/:id/diffs", (req: Request, res: Response) => {
  const task = db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  res.json(task.diffs ?? []);
});

export default router;
