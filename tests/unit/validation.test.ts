import { describe, expect, it } from "vitest";
import { courseReviewSchema, loginSchema, moduleAssessmentSchema, moduleAssessmentSubmissionSchema, siteDesignSchema } from "../../lib/validation";

describe("loginSchema", () => {
  it("accepts a valid email and password", () => {
    expect(
      loginSchema.safeParse({ email: "aluno@example.com", password: "senha" })
        .success,
    ).toBe(true);
  });

  it("rejects malformed email addresses", () => {
    expect(
      loginSchema.safeParse({ email: "invalido", password: "senha" }).success,
    ).toBe(false);
  });
});

describe("siteDesignSchema", () => {
  it("accepts valid global design settings", () => {
    expect(
      siteDesignSchema.safeParse({
        brand_name: "Bible Academy",
        accent_color: "#24483a",
        accent_secondary: "#d6b36a",
        hero_title: "Cursos bíblicos para estudar",
        hero_description: "Aprenda no seu ritmo.",
        hero_image_url: "https://i.imgur.com/example.jpg",
      }).success,
    ).toBe(true);
  });

  it("rejects non-hex theme colors", () => {
    expect(
      siteDesignSchema.safeParse({
        brand_name: "Bible Academy",
        accent_color: "green",
        accent_secondary: "#d6b36a",
        hero_title: "Cursos bíblicos para estudar",
        hero_description: "",
        hero_image_url: null,
      }).success,
    ).toBe(false);
  });
});

describe("courseReviewSchema", () => {
  it("accepts a rating from one to five and an optional comment", () => {
    expect(courseReviewSchema.safeParse({ rating: 5, comment: "Muito bom" }).success).toBe(true);
    expect(courseReviewSchema.safeParse({ rating: 4 }).success).toBe(true);
  });

  it("rejects out-of-range ratings and overly long comments", () => {
    expect(courseReviewSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(courseReviewSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(courseReviewSchema.safeParse({ rating: 3, comment: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("module assessment schemas", () => {
  it("accepts a quiz with a valid answer index", () => {
    expect(moduleAssessmentSchema.safeParse({
      title: "Revisão do módulo",
      pass_percentage: 70,
      questions: [{ prompt: "Qual é o tema?", options: ["Aliança", "Exílio"], correct_option: 0 }],
    }).success).toBe(true);
  });

  it("rejects an answer index outside the options and malformed submissions", () => {
    expect(moduleAssessmentSchema.safeParse({
      title: "Revisão do módulo",
      pass_percentage: 70,
      questions: [{ prompt: "Qual é o tema?", options: ["Aliança", "Exílio"], correct_option: 2 }],
    }).success).toBe(false);
    expect(moduleAssessmentSubmissionSchema.safeParse({ answers: [0, 9] }).success).toBe(false);
  });
});
