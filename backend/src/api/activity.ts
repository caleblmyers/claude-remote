import { Router, Request, Response } from "express";
import { listActivityLog } from "../db";

const router: Router = Router();

router.get("/activity", (req: Request, res: Response) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  const entries = listActivityLog(limit, offset);
  res.json(entries);
});

export default router;
