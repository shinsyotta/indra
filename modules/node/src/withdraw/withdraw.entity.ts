import { BigNumber } from "ethers/utils";
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Channel } from "../channel/channel.entity";
import { IsEthAddress, IsBytes32, IsXpub } from "../util";

@Entity()
export class Withdraw {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn({ type: "timestamp" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updatedAt!: Date;

  @Column("text", {
    transformer: {
      from: (value: string): BigNumber => new BigNumber(value),
      to: (value: BigNumber): string => value.toString(),
    },
  })
  amount!: BigNumber;

  @Column("text")
  @IsEthAddress()
  assetId!: string;

  @Column("text")
  @IsEthAddress()
  recipient!: string;

  @Column("text")
  @IsBytes32()
  appInstanceId!: string;

  @Column("text")
  @IsBytes32()
  data!: string;

  @Column("text")
  @IsBytes32()
  withdrawerSignature!: string;

  @Column("text", { nullable: true })
  @IsBytes32()
  counterpartySignature!: string;

  @Column("text")
  finalized!: boolean;

  @ManyToOne(
    (type: any) => Channel,
    (channel: Channel) => channel.multisigAddress,
  )
  channel!: Channel;

  @Column({ type: "json" })
  meta: object;
}