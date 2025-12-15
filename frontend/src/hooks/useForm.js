export function useForm() {
  const handleSubmit = (formSelector, onSubmit) => {
    setTimeout(() => {
      const form = document.querySelector(formSelector);

      if (!form) {
        console.warn(`No form found for selector ${formSelector}`);
        return;
      }
      if (form.dataset.listenerAttached === "true") {
        console.log("Submit listener already attached, skipping...");
        return;
      }
      if (form && !form.dataset.listenerAttached) {
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const formData = new FormData(form);
          const data = Object.fromEntries(formData.entries());
          onSubmit(data);
        });
        form.dataset.listenerAttached = "true";
      }
    }, 100);
  };

  const validateField = (value, rules) => {
    const errors = [];

    if (rules.required && !value.trim()) {
      errors.push("This field is required");
    }

    if (rules.minLength && value.length < rules.minLength) {
      errors.push(`Minimum length is ${rules.minLength}`);
    }

    if (rules.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push("Invalid email format");
    }

    return errors;
  };

  const showError = (fieldSelector, message) => {
    // Inline error display disabled; use toasts in calling code
  };

  const clearErrors = (formSelector) => {
    const form = document.querySelector(formSelector);
    if (form) {
      const errors = form.querySelectorAll(".error-message");
      errors.forEach((error) => error.remove());
    }
  };

  const setupRealTimeValidation = (formSelector, validationRules) => {
    // Inline validation messages disabled; no-op
  };

  const clearFieldError = (fieldSelector) => {
    const field = document.querySelector(fieldSelector);
    if (field) {
      const errorElement = field.parentNode.querySelector(".error-message");
      if (errorElement) {
        errorElement.remove();
      }
    }
  };

  const getFormData = (formSelector) => {
    const form = document.querySelector(formSelector);
    if (form) {
      const formData = new FormData(form);
      return Object.fromEntries(formData.entries());
    }
    return {};
  };

  const resetForm = (formSelector) => {
    const form = document.querySelector(formSelector);
    if (form) {
      form.reset();
      clearErrors(formSelector);
    }
  };

  return {
    handleSubmit,
    validateField,
    showError,
    clearErrors,
    setupRealTimeValidation,
    clearFieldError,
    getFormData,
    resetForm,
  };
}
