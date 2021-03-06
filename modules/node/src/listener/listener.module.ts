import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AppRegistryModule } from "../appRegistry/appRegistry.module";
import { CFCoreModule } from "../cfCore/cfCore.module";
import { ChannelModule } from "../channel/channel.module";
import { ChannelRepository } from "../channel/channel.repository";
import { LoggerModule } from "../logger/logger.module";
import { MessagingModule } from "../messaging/messaging.module";
import { TransferModule } from "../transfer/transfer.module";
import { LinkedTransferRepository } from "../linkedTransfer/linkedTransfer.repository";
import { AppRegistryRepository } from "../appRegistry/appRegistry.repository";
import { LinkedTransferModule } from "../linkedTransfer/linkedTransfer.module";

import ListenerService from "./listener.service";

@Module({
  controllers: [],
  exports: [ListenerService],
  imports: [
    AppRegistryModule,
    CFCoreModule,
    ChannelModule,
    LinkedTransferModule,
    LoggerModule,
    MessagingModule,
    MessagingModule,
    TransferModule,
    TypeOrmModule.forFeature([LinkedTransferRepository, ChannelRepository, AppRegistryRepository]),
  ],
  providers: [ListenerService],
})
export class ListenerModule {}
