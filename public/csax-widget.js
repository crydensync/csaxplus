/* global window, document, fetch, URL, HTMLScriptElement */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!(script instanceof HTMLScriptElement)) return;

  var apiURL = script.dataset.apiUrl;
  var targetSelector = script.dataset.target;
  if (!apiURL || !targetSelector) return;

  var target = document.querySelector(targetSelector);
  if (!target) return;

  var root = target.shadowRoot || target.attachShadow({ mode: "open" });
  var styles = document.createElement("link");
  styles.rel = "stylesheet";
  styles.href = new URL("/csax-widget.css", script.src).toString();
  root.append(styles);

  var panel = document.createElement("section");
  panel.className = "csax-panel";

  var heading = document.createElement("h2");
  heading.textContent = script.dataset.greeting || "Ask about your account";

  var form = document.createElement("form");
  var label = document.createElement("label");
  label.htmlFor = "csax-question";
  label.textContent = "Your question";

  var question = document.createElement("textarea");
  question.id = "csax-question";
  question.name = "question";
  question.required = true;
  question.maxLength = 500;
  question.rows = 3;
  question.placeholder = script.dataset.placeholder || "Ask a question about your account";

  var submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Ask";

  var status = document.createElement("p");
  status.className = "csax-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  var answer = document.createElement("pre");
  answer.className = "csax-answer";
  answer.hidden = true;

  form.append(label, question, submit, status);
  panel.append(heading, form, answer);
  root.append(panel);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var value = question.value.trim();
    if (!value) {
      status.textContent = "Enter a question first.";
      return;
    }

    var tokenProvider = window.csaxGetUserAccessToken;
    if (typeof tokenProvider !== "function") {
      status.textContent = "Sign in to your application to ask a question.";
      return;
    }

    submit.disabled = true;
    question.disabled = true;
    answer.hidden = true;
    status.textContent = "Thinking…";
    try {
      var token = await tokenProvider();
      if (typeof token !== "string" || !token.trim()) {
        throw new Error("missing_user_token");
      }

      var response = await fetch(new URL("/v1/ask-ai", apiURL).toString(), {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: {
          accept: "application/json",
          authorization: "Bearer " + token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ question: value }),
      });
      var payload = await response.json();
      var data = payload && payload.data;
      if (!response.ok || !data || typeof data.answer !== "string") {
        throw new Error(response.status === 401 ? "session_expired" : "request_failed");
      }

      answer.textContent = data.answer;
      answer.hidden = false;
      status.textContent = Number.isInteger(data.row_count)
        ? data.row_count + (data.row_count === 1 ? " result" : " results")
        : "Answered.";
    } catch (error) {
      status.textContent =
        error && error.message === "session_expired"
          ? "Your sign-in has expired. Sign in again and retry."
          : error && error.message === "missing_user_token"
            ? "Sign in to your application to ask a question."
            : "The widget could not answer. Try again in a moment.";
    } finally {
      submit.disabled = false;
      question.disabled = false;
    }
  });
})();
