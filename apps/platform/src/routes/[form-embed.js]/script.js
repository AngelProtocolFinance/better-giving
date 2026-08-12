(() => {
  const script_tag = document.currentScript;
  if (!script_tag) return;

  // safely parse script origin
  let script_origin;
  try {
    script_origin = new URL(script_tag.src).origin;
  } catch (error) {
    console.error("Invalid script src URL:", error);
    return;
  }

  // find all elements with data-bg-form attribute
  const containers = document.querySelectorAll("[data-bg-form]");
  if (containers.length === 0) {
    console.error("No element with data-bg-form attribute found");
    return;
  }

  // process each container
  for (const container of containers) {
    // extract and validate form_id from the data attribute
    const form_id = container.getAttribute("data-bg-form");
    if (!form_id) {
      console.error(
        "form_id could not be extracted from data-bg-form attribute"
      );
      continue;
    }

    // validate form_id to prevent path traversal and XSS
    if (!/^[a-zA-Z0-9_-]+$/.test(form_id)) {
      console.error(
        "Invalid form_id format. Only alphanumeric, underscore, and hyphen allowed."
      );
      continue;
    }

    // create iframe with security attributes
    const iframe = document.createElement("iframe");
    // generate unique ID for iframe using form_id and a unique suffix
    iframe.id = `bg-form-iframe-${form_id}-${Math.random().toString(36).slice(2, 11)}`;
    // tell the form which origin is framing it, so the messages it sends back
    // are aimed at this page instead of broadcast to whoever can read them.
    // both skew directions hold: a form deploy that predates the parameter
    // ignores it, and a newer form falls back to the old wildcard when a
    // cached copy of this script doesn't send it. the form route is
    // shared-cached, so this splits its entry one way per embedding origin —
    // not per page, and not per visitor.
    iframe.src = `${script_origin}/forms/${form_id}?parent_origin=${encodeURIComponent(window.location.origin)}`;

    // check if user set width on container (attribute or inline style)
    const container_width =
      container.getAttribute("width") || container.style.width;
    iframe.style.width = container_width || "100%";

    // check if user set height on container (attribute or inline style)
    const container_height =
      container.getAttribute("height") || container.style.height;
    if (container_height) {
      iframe.style.height = container_height;
    }

    iframe.style.border = "none";
    iframe.allow = "payment";

    // add sandbox attribute for security (adjust permissions as needed)
    // allow-popups-to-escape-sandbox: required so paypal popup window
    // (login/approval) doesn't inherit our sandbox flags — otherwise
    // cookies/storage on paypal.com may break inside the popup.
    iframe.sandbox =
      "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";

    // set title for accessibility
    iframe.title = `Form ${form_id}`;

    container.appendChild(iframe);

    // create AbortController for cleanup
    const abort_controller = new AbortController();

    const handle_message = (e) => {
      // validate origin
      if (e.origin !== script_origin) return;

      // validate message structure and form_id
      if (e.data?.form_id !== form_id) return;

      if (e.data?.type === "resize") {
        // validate height is a positive number within reasonable bounds
        const height = Number(e.data.height);
        if (Number.isNaN(height) || height < 0 || height > 50000) {
          console.warn("Invalid height value received:", e.data.height);
          return;
        }
        iframe.style.height = `${height}px`;
      } else if (e.data?.type === "redirect" && e.data?.redirect_url) {
        // validate and perform redirect
        try {
          const url = new URL(e.data.redirect_url);
          // only allow http and https protocols for security
          if (url.protocol === "http:" || url.protocol === "https:") {
            // tell the frame we're taking the top page there, so its own
            // fallback stands down. left running it gives up on us after a
            // second and a half and either loads the thank-you page a second
            // time inside the frame, or — for a merchant's own destination,
            // which it refuses to load in here — tells the donor they're
            // stuck while the top page is already on its way there. purely
            // additive: a frame that doesn't listen for this just falls back
            // on its timer, exactly as before.
            //
            // ordering holds: the assignment below starts a navigation, it
            // does not unload anything until the next document arrives, so
            // the frame stays alive to run the task this queues on it.
            iframe.contentWindow?.postMessage(
              { type: "redirect_ack", form_id },
              script_origin
            );
            window.location.href = e.data.redirect_url;
          } else {
            console.warn("Invalid redirect URL protocol:", url.protocol);
          }
        } catch (_) {
          console.warn("Invalid redirect URL:", e.data.redirect_url);
        }
      }
    };

    window.addEventListener("message", handle_message, {
      signal: abort_controller.signal,
    });

    // cleanup when iframe is removed from DOM
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node === iframe || node.contains?.(iframe)) {
            abort_controller.abort();
            observer.disconnect();
          }
        }
      }
    });

    if (container.parentNode) {
      observer.observe(container.parentNode, {
        childList: true,
        subtree: true,
      });
    }
  }
})();
