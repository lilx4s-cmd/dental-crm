import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';

// Patient-facing tone: clear, warm, jargon-light. Used for summary + WhatsApp drafting.
const PATIENT_FACING_SYSTEM_PROMPT =
  'You are a helpful assistant for a dental clinic, writing directly to patients. ' +
  'Be clear, warm, reassuring, and avoid clinical jargon where a plain-language equivalent exists. ' +
  'Keep responses concise and well-formatted for reading on a phone screen.';

// Staff-facing tone: terser, clinical shorthand is fine.
const STAFF_FACING_SYSTEM_PROMPT =
  'You are an assistant for dental clinic staff drafting clinical treatment plan line items. ' +
  'Be concise and clinically precise. Staff will review and edit every suggestion before it is used.';

export interface SuggestedItem {
  description: string;
  suggestedCategory?: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.config.get<string>('xai.apiKey');
    this.model = this.config.get<string>('xai.model') ?? 'grok-4.5';
    // Never construct a client (or attempt a network call) without a key — an empty apiKey
    // would otherwise let the SDK build fine and only fail cryptically on first request.
    this.client = apiKey ? new OpenAI({ apiKey, baseURL: this.config.get<string>('xai.baseUrl') }) : null;
  }

  /** Every public method must call this before attempting any network request. */
  private ensureConfigured(): OpenAI {
    if (!this.client) {
      throw new ServiceUnavailableException('AI features are not configured');
    }
    return this.client;
  }

  private async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const client = this.ensureConfigured();
    try {
      const completion = await client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      return completion.choices[0]?.message?.content?.trim() ?? '';
    } catch (err) {
      this.logger.error(`xAI request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('AI request failed');
    }
  }

  async generatePlanSummary(planId: string, language?: string) {
    // Client must be checked before we bother querying Prisma for context.
    this.ensureConfigured();

    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: planId },
      select: {
        title: true,
        doctorRecommendation: true,
        diagnosisSnapshot: true,
        totalCost: true,
        currency: true,
        items: { select: { description: true, toothNumber: true, quantity: true, material: true, brand: true } },
      },
    });
    if (!plan) throw new NotFoundException('Treatment plan not found');

    const itemsText = plan.items
      .map((i) => `- ${i.description}${i.toothNumber ? ` (tooth ${i.toothNumber})` : ''} x${i.quantity}${i.material ? `, ${i.material}` : ''}${i.brand ? ` ${i.brand}` : ''}`)
      .join('\n');

    const languageInstruction = language ? `Write the summary in ${language}.` : 'Write the summary in English.';

    const userPrompt = [
      `Treatment plan: "${plan.title}"`,
      plan.diagnosisSnapshot ? `Diagnosis: ${plan.diagnosisSnapshot}` : '',
      plan.doctorRecommendation ? `Doctor's recommendation: ${plan.doctorRecommendation}` : '',
      `Total cost: ${plan.totalCost} ${plan.currency}`,
      itemsText ? `Procedures:\n${itemsText}` : '',
      '',
      'Write a short, patient-friendly plain-language summary (2-4 short paragraphs) explaining ' +
        'what this treatment plan involves and why it is recommended, so the patient can understand it easily. ' +
        languageInstruction,
    ]
      .filter(Boolean)
      .join('\n');

    const summary = await this.complete(PATIENT_FACING_SYSTEM_PROMPT, userPrompt);

    return this.prisma.treatmentPlan.update({
      where: { id: planId },
      data: { aiSummary: summary },
      select: {
        id: true,
        aiSummary: true,
      },
    });
  }

  async suggestItems(diagnosisText: string, categoryNames?: string[]): Promise<SuggestedItem[]> {
    this.ensureConfigured();

    const categoriesLine = categoryNames?.length ? `Available treatment categories: ${categoryNames.join(', ')}.` : '';

    const userPrompt = [
      `Patient diagnosis notes: ${diagnosisText}`,
      categoriesLine,
      '',
      'Suggest 3-6 draft treatment plan line-item descriptions appropriate for this diagnosis. ' +
        'Respond ONLY with a JSON array of objects, each with "description" and optionally "suggestedCategory" ' +
        '(one of the available categories, if relevant). Do not include any other text.',
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await this.complete(STAFF_FACING_SYSTEM_PROMPT, userPrompt);
    return this.parseSuggestedItems(raw);
  }

  private parseSuggestedItems(raw: string): SuggestedItem[] {
    // Grok may wrap JSON in a markdown code fence despite instructions — strip it defensively.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) =>
            typeof entry === 'string'
              ? { description: entry }
              : { description: String(entry.description ?? ''), suggestedCategory: entry.suggestedCategory },
          )
          .filter((entry) => entry.description);
      }
    } catch (err) {
      this.logger.warn(`Failed to parse AI item suggestions as JSON: ${(err as Error).message}`);
    }
    // Fall back to treating each non-empty line as a suggestion so a malformed response
    // still surfaces something useful to staff instead of an empty list.
    return cleaned
      .split('\n')
      .map((line) => line.replace(/^[-*\d.]+\s*/, '').trim())
      .filter(Boolean)
      .map((description) => ({ description }));
  }

  async draftWhatsAppMessage(patientId?: string, treatmentPlanId?: string, context?: string) {
    this.ensureConfigured();

    let patientName = 'the patient';
    let planContext = '';

    if (treatmentPlanId) {
      const plan = await this.prisma.treatmentPlan.findUnique({
        where: { id: treatmentPlanId },
        select: {
          title: true,
          status: true,
          totalCost: true,
          currency: true,
          patient: { select: { firstName: true, lastName: true } },
        },
      });
      if (plan) {
        patientName = `${plan.patient.firstName} ${plan.patient.lastName}`;
        planContext = `Treatment plan "${plan.title}" — status: ${plan.status}, total: ${plan.totalCost} ${plan.currency}.`;
      }
    } else if (patientId) {
      const patient = await this.prisma.patient.findUnique({
        where: { id: patientId },
        select: { firstName: true, lastName: true },
      });
      if (patient) patientName = `${patient.firstName} ${patient.lastName}`;
    }

    const userPrompt = [
      `Patient name: ${patientName}.`,
      planContext,
      context ? `Additional context: ${context}` : '',
      '',
      'Draft a short, friendly WhatsApp message (2-4 sentences) from the dental clinic to this patient. ' +
        'Keep it warm and professional. Do not include a greeting placeholder like [Name] — use the actual name given.',
    ]
      .filter(Boolean)
      .join('\n');

    const message = await this.complete(PATIENT_FACING_SYSTEM_PROMPT, userPrompt);
    return { message };
  }
}
