"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Retry function with exponential backoff
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Check if it's a service unavailable error
      if (error.message?.includes('503') || error.message?.includes('overloaded')) {
        const delay = baseDelay * Math.pow(2, i);
        console.log(`API overloaded, retrying in ${delay}ms... (attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
};

export const generateAIInsights = async (industry) => {
  const prompt = `
          Analyze the current state of the ${industry} industry in INDIA and provide insights in ONLY the following JSON format without any additional notes or explanations:
          {
            "salaryRanges": [
              { "role": "string", "min": number, "max": number, "median": number, "location": "string" }
            ],
            "growthRate": number,
            "demandLevel": "High" | "Medium" | "Low",
            "topSkills": ["skill1", "skill2"],
            "marketOutlook": "Positive" | "Neutral" | "Negative",
            "keyTrends": ["trend1", "trend2"],
            "recommendedSkills": ["skill1", "skill2"]
          }
          
          IMPORTANT: 
          - Return ONLY the JSON. No additional text, notes, or markdown formatting.
          - All salary amounts should be in INDIAN RUPEES (INR) per annum
          - Include at least 5 common roles for salary ranges
          - Growth rate should be a percentage
          - Include at least 5 skills and trends
          - Focus on Indian market conditions, companies, and trends
          - Location should be Indian cities like "Mumbai", "Bangalore", "Delhi", "Hyderabad", "Pune", "Chennai", "Remote"
        `;

  try {
    const result = await retryWithBackoff(async () => {
      return await model.generateContent(prompt);
    });
    
    const response = result.response;
    const text = response.text();
    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();

    return JSON.parse(cleanedText);
  } catch (error) {
    console.error("Failed to generate AI insights after retries:", error);
    
    // Return fallback data with Indian market rates in INR
    return {
      salaryRanges: [
        { role: "Fresher/Entry Level", min: 300000, max: 600000, median: 450000, location: "Mumbai" },
        { role: "Junior Developer", min: 500000, max: 1200000, median: 800000, location: "Bangalore" },
        { role: "Mid Level Developer", min: 800000, max: 2000000, median: 1400000, location: "Delhi" },
        { role: "Senior Developer", min: 1500000, max: 3500000, median: 2500000, location: "Hyderabad" },
        { role: "Tech Lead", min: 2500000, max: 5000000, median: 3500000, location: "Pune" }
      ],
      growthRate: 12,
      demandLevel: "High",
      topSkills: ["Java", "Python", "React", "Node.js", "AWS"],
      marketOutlook: "Positive",
      keyTrends: ["Remote Work", "Digital Transformation", "AI/ML Adoption", "Cloud Migration", "Startup Growth"],
      recommendedSkills: ["Leadership", "Problem Solving", "Communication", "Agile", "DevOps"]
    };
  }
};

export async function getIndustryInsights() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    include: {
      industryInsight: true,
    },
  });

  if (!user) throw new Error("User not found");

  // If no insights exist, generate them
  if (!user.industryInsight) {
    const insights = await generateAIInsights(user.industry);

    const industryInsight = await db.industryInsight.create({
      data: {
        industry: user.industry,
        ...insights,
        nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return industryInsight;
  }

  return user.industryInsight;
}
