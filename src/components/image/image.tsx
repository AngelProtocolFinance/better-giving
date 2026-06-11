import type React from "react";
import {
  type ReactElement,
  type ReactNode,
  type Ref,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ContentLoader } from "../content-loader";
import { ImagePlaceholder } from "./image-placeholder";

type ImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  isSrcLoading?: boolean;
  render?: (img: ReactNode) => ReactElement;
};

export function Image({
  alt = "",
  className,
  isSrcLoading,
  render,
  onError,
  ref: forwarded_ref,
  ...props
}: ImageProps & { ref?: Ref<HTMLImageElement> }) {
  const ref = useRef<HTMLImageElement>(null);
  const [is_error, setError] = useState(false);

  // https://legacy.reactjs.org/docs/hooks-reference.html#useimperativehandle
  useImperativeHandle<HTMLImageElement | null, HTMLImageElement | null>(
    forwarded_ref,
    () => ref.current
  );

  if ((!props.src && !isSrcLoading) || is_error) {
    return <ImagePlaceholder className={className} />;
  }

  /**
   *
   * Using `ref.current.complete` instead of some internal `is_loading` state to check if image
   * was already loaded as it maintains state on re-render.
   *
   * Were we to use some `is_loading` state, then `Image` would flicker on every render.
   *
   * Explanation for the flicker:
   * 1. Let's assume the image was already loaded and rendered, but the user navigated away from
   *    the page/component that displayed it.
   * 2. The user decides to navigate back to the page/component with the loaded image.
   * 3. As the default `is_loading` state is `true`, the `img` component is hidden and
   *    `ContentLoader` component is displayed.
   * 4. As  the image is already loaded and cached, the `img.onLoad` triggers immediately and
   *    updates `is_loading` to `false` triggering a new render
   * 5. Component `Image` flickers as it transitions from displaying `ContentLoader` to displaying `img`
   *
   */
  const is_loading = !ref.current?.complete && isSrcLoading;
  const commonClasses = `${className} ${is_loading ? "hidden" : ""}`;

  return (
    <>
      {is_loading && <ContentLoader className={className} />}
      {/**
       *
       * Setting the logic to add `hidden` class name is necessary on both
       * `WithLink` wrapper and on the child `img`.
       *
       * Reason:
       * if no `href` was passed, that means only the image would be returned and since
       * it is returned without a wrapper, we need to apply `hidden` className manually.
       * Otherwise (if `href` was passed), we need to apply `hidden` to the link component
       * wrapping the `img`.
       *
       */}

      {render?.(
        <img
          ref={ref}
          {...props}
          className={`object-contain ${commonClasses}`}
          alt={alt}
          onError={(e) => (onError ? onError(e) : setError(true))}
        />
      ) || (
        <img
          ref={ref}
          {...props}
          className={`object-contain ${commonClasses}`}
          alt={alt}
          onError={(e) => (onError ? onError(e) : setError(true))}
        />
      )}
    </>
  );
}
