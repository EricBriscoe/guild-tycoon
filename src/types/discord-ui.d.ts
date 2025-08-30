declare module 'discord.js' {
  // Standard discord.js exports
  export class Client {
    constructor(options: any);
    user?: any;
    login(token: string): Promise<string>;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
  }
  
  export enum GatewayIntentBits {
    Guilds = 1,
  }
  
  export enum InteractionType {
    ApplicationCommand = 2,
    MessageComponent = 3,
  }
  
  export enum Partials {
    GuildMember = 5,
  }
  
  export interface Interaction {
    isCommand(): this is ChatInputCommandInteraction;
    isButton(): this is ButtonInteraction;
    isRepliable(): boolean;
    inGuild?(): boolean;
    guildId?: string;
    user: any;
    type: number;
    deferred: boolean;
    replied: boolean;
    reply(options: any): Promise<void>;
    editReply(options: any): Promise<void>;
  }
  
  export interface ChatInputCommandInteraction extends Interaction {
    commandName: string;
  }
  
  export interface ButtonInteraction extends Interaction {
    customId: string;
    channel?: any;
    update(options: any): Promise<void>;
  }
  
  export enum MessageFlags {
    Ephemeral = 64,
    IsComponentsV2 = 1048576,
  }
  
  export class REST {
    constructor(options?: any);
    setToken(token: string): this;
    put(endpoint: string, options?: any): Promise<any>;
  }
  
  export class Routes {
    static applicationGuildCommands(clientId: string, guildId: string): string;
    static applicationCommands(clientId: string): string;
  }
  
  export class SlashCommandBuilder {
    setName(name: string): this;
    setDescription(description: string): this;
    toJSON(): any;
  }
  
  export class ButtonBuilder {
    setCustomId(customId: string): this;
    setLabel(label: string): this;
    setStyle(style: any): this;
    setDisabled(disabled: boolean): this;
    setEmoji(emoji: any): this;
  }
  
  export enum ButtonStyle {
    Primary = 1,
    Secondary = 2,
    Success = 3,
    Danger = 4,
  }

  // Components V2 builders - minimal shims for this project
  // These are compile-time only and map to runtime exports provided by our discord.js build.
  export class TextDisplayBuilder {
    setContent(content: string): this;
  }

  export class ContainerBuilder {
    setAccentColor(color: number): this;
    addTextDisplayComponents(...components: any[]): this;
    addSectionComponents(...sections: any[]): this;
  }

  export class SectionBuilder {
    addTextDisplayComponents(...components: any[]): this;
    setButtonAccessory(...buttons: any[]): this;
    setThumbnailAccessory(thumbnail: any): this;
  }

  export class SeparatorBuilder {}

  export class ThumbnailBuilder {
    setURL(url: string): this;
  }
}

