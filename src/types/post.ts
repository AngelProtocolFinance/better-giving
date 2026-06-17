export interface ISanityImage {
  asset?: { _ref: string };
  alt?: string;
}

export interface IPostListItem {
  _id: string;
  title: string;
  slug: { current: string };
  publishedAt: string;
  excerpt?: string;
  image?: ISanityImage;
  authorName?: string;
}

export interface IPost extends Omit<IPostListItem, "authorName"> {
  body?: unknown[];
  author?: { name: string; image?: ISanityImage };
}

export interface IPostsPage {
  posts: IPostListItem[];
  pageNum: number;
  nextPageNum?: number;
}
