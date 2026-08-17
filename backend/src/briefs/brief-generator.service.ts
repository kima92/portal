import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LeadsService } from '../leads/leads.service';
import { Brief } from './brief.entity';
import { BriefsService } from './briefs.service';
import { BriefDrafterService, EMPTY_DRAFT } from './brief-drafter.service';
import { buildFacts } from './brief-facts';
import { renderBrief } from './brief-renderer';
import { ClaudeJsonService } from './claude-json.service';
import { detectContradictions } from './contradictions';
import { EMPTY_EXTRACTION } from './web-extraction';
import { WebsiteExtractorService } from './website-extractor.service';

export interface GenerateBriefInput {
  businessId: string;
  leadId: string;
  /** Optional site to run the 🟢 extraction against. */
  websiteUrl?: string | null;
  /** Skip the model entirely — 🔵 only. Useful when no API key is configured. */
  skipDrafting?: boolean;
}

/**
 * Orchestrates the three layers into one document:
 *
 *   🔵 questionnaire  → deterministic mapping of the client's own answers
 *   🟢 extraction     → what the business's website actually says
 *   🟠 drafting       → positioning / personas / messaging, marked as a draft
 *
 * Each layer degrades on its own: a failed extraction or a failed drafting run
 * yields ⟨לא ידוע⟩ fields, never a partial-looking brief with invented gaps
 * filled in. Only the questionnaire layer is required.
 */
@Injectable()
export class BriefGeneratorService {
  private readonly log = new Logger(BriefGeneratorService.name);

  constructor(
    private readonly leads: LeadsService,
    private readonly briefs: BriefsService,
    private readonly extractor: WebsiteExtractorService,
    private readonly drafter: BriefDrafterService,
    private readonly claude: ClaudeJsonService,
  ) {}

  async generate(input: GenerateBriefInput): Promise<Brief> {
    const lead = await this.leads.findByIdScoped(
      input.businessId,
      input.leadId,
    );
    if (!lead) throw new NotFoundException(`Lead ${input.leadId} not found`);
    if (lead.source !== 'questionnaire' || !lead.answers) {
      throw new BadRequestException(
        'הליד הזה לא מגיע משאלון אסטרטגיה — אין ממה להפיק בריף',
      );
    }

    const facts = buildFacts(lead.answers);
    const contradictions = detectContradictions(facts);
    const websiteUrl = input.websiteUrl?.trim() || null;

    const extraction = websiteUrl
      ? await this.extractor.extract(websiteUrl)
      : { ...EMPTY_EXTRACTION };

    const draft =
      input.skipDrafting || !this.claude.configured
        ? { ...EMPTY_DRAFT }
        : await this.drafter.draft({ facts, extraction, contradictions });

    const generatedAt = new Date();
    const markdown = renderBrief({
      facts,
      extraction,
      draft,
      contradictions,
      generatedAt,
      websiteUrl,
      model: this.claude.model,
    });

    this.log.log(
      `brief generated business=${input.businessId} lead=${input.leadId} ` +
        `pages=${extraction.pages.length} contradictions=${contradictions.length} ` +
        `unanswered=${facts.missing.length}`,
    );

    return this.briefs.create({
      businessId: input.businessId,
      leadId: lead.id,
      title: facts.businessName,
      markdown,
      websiteUrl,
      model: this.claude.model,
      payload: {
        facts: {
          text: facts.text,
          values: facts.values,
          missing: facts.missing,
        },
        extraction,
        draft,
        contradictions,
        generatedAt: generatedAt.toISOString(),
      },
    });
  }
}
