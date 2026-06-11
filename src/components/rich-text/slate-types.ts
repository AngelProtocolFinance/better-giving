import type { BaseEditor } from "slate";
import type { HistoryEditor } from "slate-history";
import type { ReactEditor } from "slate-react";

export type CustomText = {
  text: string;
  bold?: true;
  italic?: true;
  link?: string;
};

export type ParagraphElement = {
  type: "paragraph";
  children: CustomText[];
};
export type NumberedListElement = {
  type: "numbered-list";
  children: ListItemElement[];
};
export type BulletedListElement = {
  type: "bulleted-list";
  children: ListItemElement[];
};
export type ListItemElement = {
  type: "list-item";
  children: CustomText[];
};

export type CustomElement =
  | ParagraphElement
  | NumberedListElement
  | BulletedListElement
  | ListItemElement;

declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}
