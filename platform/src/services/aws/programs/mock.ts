import { HttpResponse, http } from "msw";
import type { IProgram } from "@/npo";

const mock_programs: IProgram[] = [
  {
    id: "program-1",
    title: "Program 1",
    description_pt: "Description for Program 1",
    milestones: [],
  },
  {
    id: "program-2",
    title: "Program 2",
    description_pt: "Description for Program 2",
    milestones: [],
  },
];

export const handlers = [
  http.get("api/npo/:id/programs", () => {
    return HttpResponse.json(mock_programs);
  }),
];
